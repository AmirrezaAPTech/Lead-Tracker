import type { PostgrestFilterBuilder } from "@supabase/postgrest-js";
import { db, TABLES } from "./db";
import { endOfToday } from "./utils";

export type LeadFilters = {
  q?: string;
  status?: string;
  tier?: string;
  campaign?: string;
  strategy?: string;
  neighborhood?: string;
  website?: string;
  instagram?: string;
  demo?: string;
  minScore?: string;
  minRating?: string;
  minReviews?: string;
  due?: string;
  sort?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = PostgrestFilterBuilder<any, any, any, any, any>;

const ACTIVE_EXCLUDED = "(WON,LOST,REJECTED)";

export const SORTS: Record<string, { column: string; ascending: boolean; nullsFirst?: boolean }[]> = {
  score: [
    { column: "pinned", ascending: false },
    { column: "score", ascending: false },
    { column: "review_count", ascending: false },
  ],
  newest: [{ column: "created_at", ascending: false }],
  due: [{ column: "next_follow_up_at", ascending: true, nullsFirst: false }],
  rating: [
    { column: "rating", ascending: false },
    { column: "review_count", ascending: false },
  ],
  reviews: [{ column: "review_count", ascending: false }],
  name: [{ column: "name", ascending: true }],
};

/**
 * Campaign membership lives in lead_sources, so it is resolved to a list of
 * lead ids first. Returns null when no campaign filter is active.
 */
export async function campaignLeadIds(campaignId?: string): Promise<string[] | null> {
  if (!campaignId || campaignId === "all") return null;
  const res = await db().from(TABLES.leadSources).select("lead_id").eq("campaign_id", campaignId).limit(20000);
  if (res.error) throw new Error(`campaign leads: ${res.error.message}`);
  return Array.from(new Set((res.data ?? []).map((r) => (r as { lead_id: string }).lead_id)));
}

/** Leads currently running a strategy. Returns null when no filter is active. */
export async function strategyLeadIds(strategyId?: string): Promise<string[] | null> {
  if (!strategyId || strategyId === "all") return null;
  if (strategyId === "none") return null;
  const res = await db().rpc("strategy_lead_ids", { p_strategy_id: strategyId });
  if (res.error) throw new Error(`strategy leads: ${res.error.message}`);
  return Array.from(new Set(((res.data ?? []) as { lead_id: string }[]).map((r) => r.lead_id)));
}

/**
 * Campaign and strategy both narrow by lead id, so they are resolved together
 * and intersected. Either one alone still returns its own list.
 */
export async function restrictLeadIds(f: LeadFilters): Promise<string[] | null> {
  const [byCampaign, byStrategy] = await Promise.all([
    campaignLeadIds(f.campaign),
    strategyLeadIds(f.strategy),
  ]);
  if (!byCampaign) return byStrategy;
  if (!byStrategy) return byCampaign;
  const strategySet = new Set(byStrategy);
  return byCampaign.filter((id) => strategySet.has(id));
}

/** PostgREST filter strings are comma separated, so those characters must go. */
function safeTerm(q: string) {
  return q.replace(/[,()*%\u005C]/g, " ").trim();
}

/** Applies every active filter to a leads query. */
export function applyLeadFilters(query: Query, f: LeadFilters, leadIds: string[] | null): Query {
  let q = query;

  if (leadIds) {
    // An empty campaign must return nothing rather than everything.
    q = q.in("id", leadIds.length ? leadIds : ["00000000-0000-0000-0000-000000000000"]);
  }

  const term = f.q?.trim() ? safeTerm(f.q) : "";
  if (term) {
    q = q.or(
      [
        `name.ilike.*${term}*`,
        `address.ilike.*${term}*`,
        `neighborhood.ilike.*${term}*`,
        `phone.ilike.*${term}*`,
        `website.ilike.*${term}*`,
        `instagram_username.ilike.*${term}*`,
      ].join(","),
    );
  }

  if (f.status && f.status !== "all") {
    if (f.status === "active") q = q.not("status", "in", ACTIVE_EXCLUDED);
    else if (f.status === "review") q = q.in("status", ["NEW", "REVIEW"]);
    else q = q.eq("status", f.status);
  } else if (!f.status) {
    // Default view hides rejected noise.
    q = q.neq("status", "REJECTED");
  }

  if (f.tier && f.tier !== "all") q = q.eq("tier", f.tier);
  if (f.neighborhood && f.neighborhood !== "all") q = q.eq("neighborhood", f.neighborhood);

  switch (f.website) {
    case "none":
      q = q.eq("has_website", false);
      break;
    case "has":
      q = q.eq("has_website", true);
      break;
    case "unchecked":
      q = q.eq("has_website", true).is("website_checked_at", null);
      break;
    case "problems":
      q = q.eq("has_website", true).lt("website_score", 70);
      break;
  }

  if (f.instagram === "yes") q = q.or("instagram_url.not.is.null,instagram_username.not.is.null");
  if (f.instagram === "no") q = q.is("instagram_url", null).is("instagram_username", null);

  if (f.demo && f.demo !== "all") q = q.eq("demo_status", f.demo);

  const minScore = Number(f.minScore);
  if (f.minScore && !Number.isNaN(minScore)) q = q.gte("score", minScore);

  const minRating = Number(f.minRating);
  if (f.minRating && !Number.isNaN(minRating)) q = q.gte("rating", minRating);

  const minReviews = Number(f.minReviews);
  if (f.minReviews && !Number.isNaN(minReviews)) q = q.gte("review_count", minReviews);

  if (f.due === "today") {
    q = q.lte("next_follow_up_at", endOfToday().toISOString()).not("status", "in", ACTIVE_EXCLUDED);
  }
  if (f.due === "any") q = q.not("next_follow_up_at", "is", null);

  return q;
}

export function applyLeadSort(query: Query, sort?: string): Query {
  let q = query;
  for (const s of SORTS[sort ?? "score"] ?? SORTS.score) {
    q = q.order(s.column, { ascending: s.ascending, nullsFirst: s.nullsFirst });
  }
  return q;
}
