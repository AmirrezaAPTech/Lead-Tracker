import { db, fromRow, fromRows, toRow, TABLES, unwrap } from "./db";
import { DEFAULT_APPOINTMENT_TYPES, DEFAULT_PREMIUM_NEIGHBORHOODS } from "./constants";
import type { Lead, LeadTier, ScoreReason, ScoringConfig } from "./types";
import { normalize } from "./utils";

export type { ScoreReason } from "./types";
export type ScoreResult = { score: number; tier: LeadTier; reasons: ScoreReason[] };

/** Reads the single scoring config row, creating it if the migration seed is missing. */
export async function getScoringConfig(): Promise<ScoringConfig> {
  const existing = await db().from(TABLES.scoringConfig).select("*").eq("id", "default").maybeSingle();
  if (existing.error) throw new Error(`load scoring config: ${existing.error.message}`);
  if (existing.data) return fromRow<ScoringConfig>(existing.data)!;

  const created = await db()
    .from(TABLES.scoringConfig)
    .insert(
      toRow({
        id: "default",
        premiumNeighborhoods: DEFAULT_PREMIUM_NEIGHBORHOODS,
        appointmentTypes: DEFAULT_APPOINTMENT_TYPES,
      }),
    )
    .select()
    .single();

  return fromRow<ScoringConfig>(unwrap(created, "create scoring config"))!;
}

/** The subset of a lead the score actually depends on. */
export type ScoreableLead = Pick<
  Lead,
  | "hasWebsite"
  | "website"
  | "websiteIssues"
  | "websiteScore"
  | "instagramUrl"
  | "instagramActive"
  | "instagramFollowers"
  | "reviewCount"
  | "rating"
  | "neighborhood"
  | "district"
  | "address"
  | "types"
  | "primaryType"
  | "category"
>;

function isPremiumArea(lead: ScoreableLead, cfg: ScoringConfig) {
  const list = cfg.premiumNeighborhoods.length ? cfg.premiumNeighborhoods : DEFAULT_PREMIUM_NEIGHBORHOODS;
  const haystack = normalize([lead.neighborhood, lead.district, lead.address].filter(Boolean).join(" "));
  return list.find((n) => n.trim() && haystack.includes(normalize(n)));
}

function isAppointmentBased(lead: ScoreableLead, cfg: ScoringConfig) {
  const list = cfg.appointmentTypes.length ? cfg.appointmentTypes : DEFAULT_APPOINTMENT_TYPES;
  const types = [...(lead.types ?? []), lead.primaryType, lead.category]
    .filter(Boolean)
    .map((t) => normalize(String(t)));
  return list.some((t) => types.some((x) => x.includes(normalize(t))));
}

/**
 * Prioritisation score only. It says how attractive a lead looks for outreach,
 * it does NOT predict whether the business will buy.
 */
export function computeScore(lead: ScoreableLead, cfg: ScoringConfig): ScoreResult {
  const reasons: ScoreReason[] = [];
  const add = (label: string, points: number) => {
    if (points > 0) reasons.push({ label, points });
  };

  if (!lead.hasWebsite || !lead.website) {
    add("No website", cfg.noWebsite);
  } else if ((lead.websiteIssues?.length ?? 0) > 0) {
    add(`Website problems: ${lead.websiteIssues.slice(0, 3).join(", ")}`, cfg.websiteProblems);
  }

  if (lead.instagramActive) add("Active Instagram", cfg.instagramActive);
  if ((lead.instagramFollowers ?? 0) >= cfg.followerThreshold) {
    add(`${lead.instagramFollowers} Instagram followers`, cfg.instagramFollowers);
  }
  if ((lead.reviewCount ?? 0) >= cfg.reviewThreshold) {
    add(`${lead.reviewCount} Google reviews`, cfg.manyReviews);
  }
  if ((lead.rating ?? 0) >= cfg.ratingThreshold) add(`${lead.rating} rating`, cfg.highRating);

  const premium = isPremiumArea(lead, cfg);
  if (premium) add(`Premium location (${premium})`, cfg.premiumNeighborhood);
  if (isAppointmentBased(lead, cfg)) add("Appointment-based business", cfg.appointmentBased);

  const score = Math.max(0, Math.min(100, reasons.reduce((sum, r) => sum + r.points, 0)));
  const tier: LeadTier =
    score >= cfg.hotMin ? "HOT" : score >= cfg.goodMin ? "GOOD" : score >= cfg.maybeMin ? "MAYBE" : "LOW";

  return { score, tier, reasons };
}

/** Rescores one lead and persists the result. */
export async function rescoreLead(leadId: string, cfg?: ScoringConfig): Promise<Lead | null> {
  const config = cfg ?? (await getScoringConfig());
  const found = await db().from(TABLES.leads).select("*").eq("id", leadId).maybeSingle();
  if (found.error) throw new Error(`load lead: ${found.error.message}`);
  const lead = fromRow<Lead>(found.data);
  if (!lead) return null;

  const result = computeScore(lead, config);
  const updated = await db()
    .from(TABLES.leads)
    .update(
      toRow({
        score: result.score,
        tier: result.tier,
        scoreReasons: result.reasons,
        scoredAt: new Date().toISOString(),
      }),
    )
    .eq("id", leadId)
    .select()
    .single();

  return fromRow<Lead>(unwrap(updated, "rescore lead"));
}

/** Rescores every lead that has not been rejected. Used after editing the config. */
export async function rescoreAll() {
  const cfg = await getScoringConfig();
  const res = await db().from(TABLES.leads).select("*").neq("status", "REJECTED");
  const leads = fromRows<Lead>(unwrap(res, "load leads for rescore"));

  let updated = 0;
  const now = new Date().toISOString();

  for (const lead of leads) {
    const r = computeScore(lead, cfg);
    if (r.score !== lead.score || r.tier !== lead.tier) updated++;
    const write = await db()
      .from(TABLES.leads)
      .update(toRow({ score: r.score, tier: r.tier, scoreReasons: r.reasons, scoredAt: now }))
      .eq("id", lead.id);
    if (write.error) throw new Error(`rescore ${lead.id}: ${write.error.message}`);
  }

  return { total: leads.length, updated };
}
