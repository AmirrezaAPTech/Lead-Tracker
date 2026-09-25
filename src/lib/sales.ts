import { db, fromRow, toRow, TABLES, unwrap } from "./db";
import { getScoringConfig } from "./scoring";
import { activeStrategyId } from "./strategy";
import { POSITIVE_RESPONSE_CLASSES } from "./constants";
import type {
  ActivityType,
  ContactMethod,
  Lead,
  LeadStatus,
  OutreachEvent,
  ResponseClass,
} from "./types";

/** Statuses that mean the deal is finished. */
export const CLOSED_STATUSES: LeadStatus[] = ["WON", "LOST", "REJECTED"];

export function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d;
}

/** Day 2 / day 5 / day 9 by default, configurable in Settings. */
export async function nextFollowUpDate(followUpsSent: number, from = new Date()) {
  const cfg = await getScoringConfig();
  const days = cfg.followUpDays.length ? cfg.followUpDays : [2, 5, 9];
  return addDays(from, days[Math.min(followUpsSent, days.length - 1)]);
}

export function followUpLabel(number: number, total = 3) {
  return number >= total ? "Final follow-up" : `Follow-up #${number}`;
}

/** Suggested next action - a hint for the queue, never an automated send. */
export function suggestNextAction(lead: Pick<Lead, "status" | "followUpCount" | "responded">) {
  if (lead.status === "RESPONDED" || lead.responded) return "Reply and book a call";
  if (lead.status === "CALL") return "Make the call";
  if (lead.status === "DEMO") return "Send / show the demo";
  if (lead.status === "PROPOSAL") return "Chase the proposal decision";
  if (lead.status === "CONTACTED") return followUpLabel(lead.followUpCount + 1);
  if (lead.status === "QUALIFIED") return "First contact";
  return "Review lead";
}

/** Extra attribution carried by the activity rows that count as results. */
type OutreachStamp = { event: OutreachEvent; responseClass?: ResponseClass | null };

/**
 * Writes one row to the shared activity feed. There is no second CRM: strategy
 * performance is read back out of these rows.
 *
 * When a stamp is supplied the row also records the strategy that was active
 * on the lead at this moment. Freezing it here is what keeps history honest -
 * re-assigning the lead later cannot retroactively move this result.
 */
export async function logActivity(
  leadId: string,
  type: ActivityType,
  title: string,
  body?: string | null,
  meta?: Record<string, unknown>,
  stamp?: OutreachStamp,
) {
  const strategyId = stamp ? await activeStrategyId(leadId) : null;

  const res = await db().from(TABLES.activities).insert(
    toRow({
      leadId,
      type,
      title,
      body: body ?? null,
      meta: meta ?? null,
      strategyId,
      outreachEvent: stamp?.event ?? null,
      responseClass: stamp?.responseClass ?? null,
    }),
  );
  if (res.error) throw new Error(`log activity: ${res.error.message}`);
}

/**
 * Pipeline stages that are also outreach milestones. Moving a lead here is the
 * result the strategy is judged on; every other status change is bookkeeping.
 */
const STATUS_EVENT: Partial<Record<LeadStatus, OutreachEvent>> = {
  RESPONDED: "RESPONSE",
  CALL: "CALL",
  DEMO: "DEMO",
  PROPOSAL: "PROPOSAL",
  WON: "WON",
  LOST: "LOST",
};

async function getLead(id: string): Promise<Lead | null> {
  const res = await db().from(TABLES.leads).select("*").eq("id", id).maybeSingle();
  if (res.error) throw new Error(`load lead: ${res.error.message}`);
  return fromRow<Lead>(res.data);
}

/** Records an outbound contact I made by hand and queues the next follow-up. */
export async function markContacted(leadId: string, method: ContactMethod, note?: string) {
  const lead = await getLead(leadId);
  if (!lead) return null;

  const now = new Date();
  const nowIso = now.toISOString();
  const isFirst = !lead.firstContactAt;
  const followUpsSent = isFirst ? 0 : lead.followUpCount + 1;
  const dueAt = await nextFollowUpDate(followUpsSent, now);

  const status: LeadStatus = CLOSED_STATUSES.includes(lead.status)
    ? lead.status
    : lead.status === "RESPONDED"
      ? "RESPONDED"
      : "CONTACTED";

  const updated = await db()
    .from(TABLES.leads)
    .update(
      toRow({
        contactMethod: method,
        firstContactAt: lead.firstContactAt ?? nowIso,
        lastContactAt: nowIso,
        followUpCount: isFirst ? 0 : lead.followUpCount + 1,
        nextFollowUpAt: dueAt.toISOString(),
        status,
      }),
    )
    .eq("id", leadId)
    .select()
    .single();

  const result = fromRow<Lead>(unwrap(updated, "mark contacted"));

  // Close whatever was still open, then queue the next one.
  const close = await db()
    .from(TABLES.followUps)
    .update({ done_at: nowIso })
    .eq("lead_id", leadId)
    .is("done_at", null)
    .eq("skipped", false);
  if (close.error) throw new Error(`close follow-ups: ${close.error.message}`);

  const create = await db()
    .from(TABLES.followUps)
    .insert(
      toRow({
        leadId,
        number: followUpsSent + 1,
        dueAt: dueAt.toISOString(),
        channel: method,
        action: followUpLabel(followUpsSent + 1),
      }),
    );
  if (create.error) throw new Error(`create follow-up: ${create.error.message}`);

  // Follow-ups are stamped as CONTACT too. Counts are per distinct lead, so
  // chasing the same salon three times is still one contacted lead - but if the
  // lead moved to another strategy in between, that strategy gets the credit.
  await logActivity(
    leadId,
    isFirst ? "CONTACT" : "FOLLOW_UP",
    isFirst ? `First contact via ${method}` : `${followUpLabel(lead.followUpCount + 1)} via ${method}`,
    note,
    undefined,
    { event: "CONTACT" },
  );

  return result;
}

/** Applies a pipeline status change and keeps the derived timestamps consistent. */
export async function setStatus(leadId: string, status: LeadStatus, note?: string) {
  const lead = await getLead(leadId);
  if (!lead) return null;

  const nowIso = new Date().toISOString();
  const data: Record<string, unknown> = { status };

  if (status === "RESPONDED") {
    data.responded = true;
    data.respondedAt = lead.respondedAt ?? nowIso;
    // Moving the card without saying how the reply went is recorded as
    // NEUTRAL: it counts as a response, but never as a positive one.
    if (lead.responseClass === "NO_RESPONSE") data.responseClass = "NEUTRAL";
  }
  if (status === "WON") {
    data.wonAt = nowIso;
    data.nextFollowUpAt = null;
  }
  if (status === "LOST") {
    data.lostAt = nowIso;
    data.nextFollowUpAt = null;
    if (note) data.lostReason = note;
  }
  if (status === "DEMO") data.demoCreated = true;
  if (status === "PROPOSAL" && lead.proposalStatus === "NONE") data.proposalStatus = "SENT";

  const updated = await db().from(TABLES.leads).update(toRow(data)).eq("id", leadId).select().single();
  const result = fromRow<Lead>(unwrap(updated, "set status"));

  if (CLOSED_STATUSES.includes(status)) {
    const skip = await db().from(TABLES.followUps).update({ skipped: true }).eq("lead_id", leadId).is("done_at", null);
    if (skip.error) throw new Error(`skip follow-ups: ${skip.error.message}`);
  }

  const event = STATUS_EVENT[status];
  await logActivity(
    leadId,
    "STATUS_CHANGE",
    `${lead.status} -> ${status}`,
    note,
    undefined,
    event ? { event, responseClass: event === "RESPONSE" ? (result?.responseClass ?? null) : null } : undefined,
  );
  return result;
}

/**
 * Records how a reply actually went. This is the only place the response class
 * is set from an explicit judgement, so it is also where a lead sitting in an
 * earlier stage gets pulled forward to RESPONDED.
 */
export async function recordResponse(leadId: string, responseClass: ResponseClass, note?: string) {
  const lead = await getLead(leadId);
  if (!lead) return null;

  const nowIso = new Date().toISOString();
  const replied = responseClass !== "NO_RESPONSE";
  const data: Record<string, unknown> = { responseClass };

  if (replied) {
    data.responded = true;
    data.respondedAt = lead.respondedAt ?? nowIso;
    if (note) data.responseNotes = note;
    // Only ever move forwards: a lead already at DEMO does not fall back.
    const early: LeadStatus[] = ["NEW", "REVIEW", "QUALIFIED", "CONTACTED"];
    if (early.includes(lead.status)) data.status = "RESPONDED";
  }

  const updated = await db().from(TABLES.leads).update(toRow(data)).eq("id", leadId).select().single();
  const result = fromRow<Lead>(unwrap(updated, "record response"));

  await logActivity(
    leadId,
    "RESPONSE",
    `Response: ${responseClass}`,
    note,
    undefined,
    // NO_RESPONSE is a correction, not a reply, so it is not counted as one.
    replied ? { event: "RESPONSE", responseClass } : undefined,
  );

  return result;
}

/** Kept next to the enum it mirrors so the two lists cannot drift apart. */
export function isPositiveResponse(responseClass: ResponseClass) {
  return POSITIVE_RESPONSE_CLASSES.includes(responseClass);
}
