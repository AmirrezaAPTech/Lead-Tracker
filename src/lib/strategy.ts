import { db, fromRow, fromRows, toRow, TABLES, unwrap } from "./db";
import { SAMPLE_BANDS } from "./constants";
import type { Strategy, StrategyAssignment } from "./types";

/**
 * Outreach strategy plumbing.
 *
 * Two rules drive everything here:
 *
 * 1. A lead runs one strategy at a time. Changing it closes the current
 *    assignment and opens a new one; nothing is ever overwritten or deleted.
 * 2. Results belong to the strategy that was active when the outreach
 *    happened. Milestones are stamped onto the activity row at insert time
 *    (see logActivity in sales.ts), so re-assigning a lead tomorrow cannot
 *    move yesterday's results onto the new strategy.
 *
 * This file deliberately imports nothing from sales.ts: the dependency runs
 * one way (sales -> strategy) so the two can never form a cycle.
 */

/** The assignment currently in force for a lead, or null if it has no strategy. */
export async function activeAssignment(leadId: string): Promise<StrategyAssignment | null> {
  const res = await db()
    .from(TABLES.strategyAssignments)
    .select("*, strategy:strategies(*)")
    .eq("lead_id", leadId)
    .is("ended_at", null)
    .maybeSingle();
  if (res.error) throw new Error(`active strategy: ${res.error.message}`);
  return fromRow<StrategyAssignment>(res.data as unknown as Record<string, unknown>);
}

/** Strategy id to stamp on an outreach milestone logged right now. */
export async function activeStrategyId(leadId: string): Promise<string | null> {
  const res = await db()
    .from(TABLES.strategyAssignments)
    .select("strategy_id")
    .eq("lead_id", leadId)
    .is("ended_at", null)
    .maybeSingle();
  if (res.error) throw new Error(`active strategy id: ${res.error.message}`);
  return (res.data as { strategy_id: string } | null)?.strategy_id ?? null;
}

/** Every strategy a lead has run, newest first. Nothing is ever removed. */
export async function assignmentHistory(leadId: string): Promise<StrategyAssignment[]> {
  const res = await db()
    .from(TABLES.strategyAssignments)
    .select("*, strategy:strategies(*)")
    .eq("lead_id", leadId)
    .order("assigned_at", { ascending: false });
  if (res.error) throw new Error(`strategy history: ${res.error.message}`);
  return fromRows<StrategyAssignment>(res.data as unknown as Record<string, unknown>[]);
}

export type AssignResult = { assigned: number; unchanged: number };

/**
 * Points a batch of leads at one strategy.
 *
 * Leads already running that strategy are left alone, so re-running an
 * assignment does not churn the history or reset the assigned date. Every
 * other lead gets its open assignment closed and a fresh one opened.
 */
export async function assignStrategy(leadIds: string[], strategyId: string, note?: string): Promise<AssignResult> {
  const ids = Array.from(new Set(leadIds));
  if (!ids.length) return { assigned: 0, unchanged: 0 };

  const strategy = await getStrategy(strategyId);
  if (!strategy) throw new Error("Strategy not found");

  const openRes = await db()
    .from(TABLES.strategyAssignments)
    .select("lead_id, strategy_id")
    .in("lead_id", ids)
    .is("ended_at", null);
  if (openRes.error) throw new Error(`load assignments: ${openRes.error.message}`);

  const open = (openRes.data ?? []) as { lead_id: string; strategy_id: string }[];
  const alreadyOn = new Set(open.filter((a) => a.strategy_id === strategyId).map((a) => a.lead_id));
  const toAssign = ids.filter((id) => !alreadyOn.has(id));
  if (!toAssign.length) return { assigned: 0, unchanged: alreadyOn.size };

  const nowIso = new Date().toISOString();

  // Close the previous period first: the partial unique index allows exactly
  // one open assignment per lead, so this must happen before the insert.
  const close = await db()
    .from(TABLES.strategyAssignments)
    .update({ ended_at: nowIso })
    .in("lead_id", toAssign)
    .is("ended_at", null);
  if (close.error) throw new Error(`close assignments: ${close.error.message}`);

  const insert = await db()
    .from(TABLES.strategyAssignments)
    .insert(
      toAssign.map((leadId) =>
        toRow({ leadId, strategyId, assignedAt: nowIso, note: note ?? null }),
      ),
    );
  if (insert.error) throw new Error(`assign strategy: ${insert.error.message}`);

  const log = await db()
    .from(TABLES.activities)
    .insert(
      toAssign.map((leadId) =>
        toRow({
          leadId,
          type: "OTHER",
          title: `Strategy: ${strategy.name}`,
          body: note ?? null,
          strategyId,
        }),
      ),
    );
  if (log.error) throw new Error(`log assignment: ${log.error.message}`);

  return { assigned: toAssign.length, unchanged: alreadyOn.size };
}

/** Takes leads off any strategy. History rows are closed, never deleted. */
export async function clearStrategy(leadIds: string[]): Promise<number> {
  const ids = Array.from(new Set(leadIds));
  if (!ids.length) return 0;

  const res = await db()
    .from(TABLES.strategyAssignments)
    .update({ ended_at: new Date().toISOString() })
    .in("lead_id", ids)
    .is("ended_at", null)
    .select("lead_id");
  if (res.error) throw new Error(`clear strategy: ${res.error.message}`);
  return (res.data ?? []).length;
}

export async function getStrategy(id: string): Promise<Strategy | null> {
  const res = await db().from(TABLES.strategies).select("*").eq("id", id).maybeSingle();
  if (res.error) throw new Error(`load strategy: ${res.error.message}`);
  return fromRow<Strategy>(res.data);
}

export async function listStrategies(includeArchived = true): Promise<Strategy[]> {
  let q = db().from(TABLES.strategies).select("*");
  if (!includeArchived) q = q.eq("status", "ACTIVE");
  const res = await q.order("created_at", { ascending: false });
  return fromRows<Strategy>(unwrap(res, "list strategies"));
}

// ------------------------------------------------------------- metrics ----

/** Raw counts straight from the strategy_metrics SQL function. */
export type StrategyMetrics = {
  strategyId: string;
  assigned: number;
  contacted: number;
  responses: number;
  positive: number;
  calls: number;
  demos: number;
  proposals: number;
  won: number;
  lost: number;
  revenue: number;
  avgDaysToClose: number | null;
};

export const EMPTY_METRICS: Omit<StrategyMetrics, "strategyId"> = {
  assigned: 0,
  contacted: 0,
  responses: 0,
  positive: 0,
  calls: 0,
  demos: 0,
  proposals: 0,
  won: 0,
  lost: 0,
  revenue: 0,
  avgDaysToClose: null,
};

export type MetricWindow = { from?: string | null; to?: string | null };

/** Counts for every strategy, keyed by id. One round trip, no group-by in JS. */
export async function loadMetrics(window: MetricWindow = {}): Promise<Map<string, StrategyMetrics>> {
  const res = await db().rpc("strategy_metrics", {
    p_from: window.from ?? null,
    p_to: window.to ?? null,
  });
  if (res.error) throw new Error(`strategy metrics: ${res.error.message}`);

  const rows = fromRows<Record<string, unknown>>(res.data as Record<string, unknown>[]);
  const map = new Map<string, StrategyMetrics>();
  for (const r of rows) {
    map.set(String(r.strategyId), {
      strategyId: String(r.strategyId),
      assigned: Number(r.assigned ?? 0),
      contacted: Number(r.contacted ?? 0),
      responses: Number(r.responses ?? 0),
      positive: Number(r.positive ?? 0),
      calls: Number(r.calls ?? 0),
      demos: Number(r.demos ?? 0),
      proposals: Number(r.proposals ?? 0),
      won: Number(r.won ?? 0),
      lost: Number(r.lost ?? 0),
      revenue: Number(r.revenue ?? 0),
      avgDaysToClose: r.avgDaysToClose === null || r.avgDaysToClose === undefined ? null : Number(r.avgDaysToClose),
    });
  }
  return map;
}

export function metricsFor(map: Map<string, StrategyMetrics>, strategyId: string): StrategyMetrics {
  return map.get(strategyId) ?? { strategyId, ...EMPTY_METRICS };
}

/**
 * A rate is null whenever its denominator is zero. Nothing downstream is
 * allowed to invent a 0% out of no data - the UI renders null as "--".
 */
export function ratio(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return numerator / denominator;
}

export type StrategyRates = {
  responseRate: number | null;
  positiveRate: number | null;
  callRate: number | null;
  demoRate: number | null;
  proposalRate: number | null;
  closeRate: number | null;
  revenuePerContact: number | null;
  avgDealValue: number | null;
};

export function rates(m: StrategyMetrics): StrategyRates {
  return {
    responseRate: ratio(m.responses, m.contacted),
    positiveRate: ratio(m.positive, m.responses),
    callRate: ratio(m.calls, m.contacted),
    demoRate: ratio(m.demos, m.contacted),
    proposalRate: ratio(m.proposals, m.contacted),
    closeRate: ratio(m.won, m.contacted),
    revenuePerContact: ratio(m.revenue, m.contacted),
    avgDealValue: ratio(m.revenue, m.won),
  };
}

/** "20%" - or "--" when there was nothing to divide by. */
export function pct(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(digits)}%`;
}

/** "2 / 10 - 20%": the raw counts stay visible next to every percentage. */
export function fraction(numerator: number, denominator: number): string {
  return `${numerator} / ${denominator} - ${pct(ratio(numerator, denominator))}`;
}

/**
 * Practical guidance only. This is not a significance test and the app must
 * never present it as one - it exists so a 7-lead result reads as preliminary.
 */
export function sampleBand(contacted: number) {
  return SAMPLE_BANDS.find((b) => contacted >= b.min) ?? SAMPLE_BANDS[SAMPLE_BANDS.length - 1];
}

/** Date-range presets for the performance filters. */
export const DATE_RANGES: { value: string; label: string; days: number | null }[] = [
  { value: "all", label: "All time", days: null },
  { value: "7", label: "Last 7 days", days: 7 },
  { value: "14", label: "Last 14 days", days: 14 },
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "90", label: "Last 90 days", days: 90 },
];

export function rangeToWindow(range?: string | null): MetricWindow {
  const preset = DATE_RANGES.find((r) => r.value === (range ?? "all"));
  if (!preset || preset.days === null) return {};
  const from = new Date();
  from.setDate(from.getDate() - preset.days);
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString() };
}
