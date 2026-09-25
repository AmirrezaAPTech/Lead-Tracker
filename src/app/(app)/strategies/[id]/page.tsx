import Link from "next/link";
import { notFound } from "next/navigation";
import { db, fromRows, TABLES } from "@/lib/db";
import { PageHeader, EmptyState, StatusBadge, TierBadge } from "@/components/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/quick-actions";
import { StrategyForm } from "@/components/strategy/strategy-form";
import { ArchiveButton } from "@/components/strategy/archive-button";
import { Metric, Rate, SampleBadge, SAMPLE_SIZE_HINT } from "@/components/strategy/metric-bits";
import {
  RESPONSE_CLASS_CLASS,
  RESPONSE_CLASS_LABEL,
  STRATEGY_CHANNEL_LABEL,
  STRATEGY_STATUS_CLASS,
  STRATEGY_STATUS_LABEL,
} from "@/lib/constants";
import { DATE_RANGES, getStrategy, loadMetrics, metricsFor, rates, rangeToWindow } from "@/lib/strategy";
import { cn, fmtDate, money } from "@/lib/utils";
import type { LeadStatus, LeadTier, ResponseClass, StrategyAssignment } from "@/lib/types";

export const dynamic = "force-dynamic";

type AssignedLead = {
  id: string;
  name: string;
  status: LeadStatus;
  tier: LeadTier;
  score: number;
  neighborhood: string | null;
  responseClass: ResponseClass;
  dealValue: number | null;
};

type AssignmentRow = StrategyAssignment & { lead: AssignedLead | null };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 py-1 last:border-0">
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-xs">{value ?? "-"}</span>
    </div>
  );
}

function Block({ label, body }: { label: string; body: string | null }) {
  if (!body) return null;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        <CopyButton value={body} label={`${label} copied`} />
      </div>
      <p className="whitespace-pre-wrap rounded-md border border-border/60 bg-muted/20 p-2.5 text-xs">{body}</p>
    </div>
  );
}

export default async function StrategyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { id } = await params;
  const { range } = await searchParams;

  const strategy = await getStrategy(id);
  if (!strategy) notFound();

  const [metrics, assignmentsRes] = await Promise.all([
    loadMetrics(rangeToWindow(range)),
    db()
      .from(TABLES.strategyAssignments)
      .select(
        "*, lead:leads(id, name, status, tier, score, neighborhood, response_class, deal_value)",
      )
      .eq("strategy_id", id)
      .order("assigned_at", { ascending: false })
      .limit(300),
  ]);
  if (assignmentsRes.error) throw new Error(`load assignments: ${assignmentsRes.error.message}`);

  const assignments = fromRows<AssignmentRow>(assignmentsRes.data as unknown as Record<string, unknown>[]);
  const current = assignments.filter((a) => !a.endedAt);
  const past = assignments.filter((a) => a.endedAt);

  const m = metricsFor(metrics, strategy.id);
  const r = rates(m);
  const activeRange = range ?? "all";

  return (
    <div>
      <PageHeader
        title={strategy.name}
        subtitle={[strategy.targetNiche, STRATEGY_CHANNEL_LABEL[strategy.channel], `created ${fmtDate(strategy.createdAt)}`]
          .filter(Boolean)
          .join(" - ")}
      >
        <Badge className={STRATEGY_STATUS_CLASS[strategy.status]}>{STRATEGY_STATUS_LABEL[strategy.status]}</Badge>
        <Button asChild size="sm" variant="outline">
          <Link href={`/leads?strategy=${strategy.id}`}>Leads on this strategy</Link>
        </Button>
        <ArchiveButton strategyId={strategy.id} status={strategy.status} />
      </PageHeader>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-6 py-2">
        <span className="mr-1 text-[10px] uppercase tracking-wide text-muted-foreground">Window</span>
        {DATE_RANGES.map((d) => (
          <Link
            key={d.value}
            href={`/strategies/${strategy.id}${d.value === "all" ? "" : `?range=${d.value}`}`}
            className={cn(
              "rounded border px-2 py-1 text-xs transition-colors",
              activeRange === d.value
                ? "border-primary/50 bg-primary/20 text-primary"
                : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {d.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 p-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>The approach</CardTitle>
              <CardDescription>
                The script you copy and send by hand. Nothing on this page sends anything for you.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Row label="Channel" value={STRATEGY_CHANNEL_LABEL[strategy.channel]} />
                <Row label="Target niche" value={strategy.targetNiche ?? "-"} />
                <Row label="Created" value={fmtDate(strategy.createdAt)} />
              </div>
              {strategy.description ? <p className="text-xs">{strategy.description}</p> : null}
              {strategy.targetCriteria ? (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Target lead criteria</div>
                  <p className="whitespace-pre-wrap text-xs">{strategy.targetCriteria}</p>
                </div>
              ) : null}
              <Block label="Opening message" body={strategy.openingMessage} />
              <Block label="Follow-up approach" body={strategy.followUpApproach} />
              {strategy.notes ? (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Notes</div>
                  <p className="whitespace-pre-wrap text-xs">{strategy.notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <StrategyForm strategy={strategy} />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-2">
              <div>
                <CardTitle>Performance</CardTitle>
                <CardDescription>Counted from what you actually recorded, over the selected window.</CardDescription>
              </div>
              <SampleBadge contacted={m.contacted} />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
                <Metric label="Assigned" value={m.assigned} />
                <Metric label="Contacted" value={m.contacted} />
                <Metric label="Responses" value={m.responses} />
                <Metric label="Positive" value={m.positive} />
                <Metric label="Calls" value={m.calls} />
                <Metric label="Demos" value={m.demos} />
                <Metric label="Proposals" value={m.proposals} />
                <Metric label="Won" value={m.won} accent="text-emerald-400" />
                <Metric label="Lost" value={m.lost} />
                <Metric label="Revenue" value={money(m.revenue)} accent="text-emerald-400" />
              </div>

              <div>
                <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Conversion</div>
                <Rate label="Contact to response" numerator={m.responses} denominator={m.contacted} />
                <Rate label="Response to positive" numerator={m.positive} denominator={m.responses} />
                <Rate label="Contact to call" numerator={m.calls} denominator={m.contacted} />
                <Rate label="Contact to demo" numerator={m.demos} denominator={m.contacted} />
                <Rate label="Contact to proposal" numerator={m.proposals} denominator={m.contacted} />
                <Rate label="Contact to won" numerator={m.won} denominator={m.contacted} />
              </div>

              <div>
                <Row label="Total revenue" value={money(m.revenue)} />
                <Row label="Average deal value" value={r.avgDealValue === null ? "--" : money(Math.round(r.avgDealValue))} />
                <Row
                  label="Revenue per contact"
                  value={r.revenuePerContact === null ? "--" : money(Math.round(r.revenuePerContact))}
                />
                <Row
                  label="First contact to close"
                  value={
                    m.avgDaysToClose === null
                      ? "-- (no closed deals yet)"
                      : `${m.avgDaysToClose.toFixed(1)} days average over ${m.won} won`
                  }
                />
              </div>

              <p className="text-[10px] text-muted-foreground">{SAMPLE_SIZE_HINT}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Leads on this strategy</CardTitle>
              <span className="tabnum text-xs text-muted-foreground">{current.length} active</span>
            </CardHeader>
            <CardContent>
              {current.length === 0 ? (
                <EmptyState
                  title="No leads assigned yet"
                  hint="Open Leads, select a batch of qualified businesses and use Assign strategy in the bulk bar."
                />
              ) : (
                <ul className="space-y-1">
                  {current.slice(0, 60).map((a) => (
                    <li key={a.id} className="flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-1.5">
                      {a.lead ? <TierBadge tier={a.lead.tier} score={a.lead.score} /> : null}
                      <Link
                        href={`/leads/${a.leadId}`}
                        className="min-w-0 flex-1 truncate text-sm hover:underline"
                      >
                        {a.lead?.name ?? "Lead"}
                      </Link>
                      {a.lead && a.lead.responseClass !== "NO_RESPONSE" ? (
                        <Badge className={RESPONSE_CLASS_CLASS[a.lead.responseClass]}>
                          {RESPONSE_CLASS_LABEL[a.lead.responseClass]}
                        </Badge>
                      ) : null}
                      {a.lead ? <StatusBadge status={a.lead.status} /> : null}
                      <span className="shrink-0 text-[10px] text-muted-foreground">{fmtDate(a.assignedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {current.length > 60 ? (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Showing the 60 most recent of {current.length}.{" "}
                  <Link href={`/leads?strategy=${strategy.id}`} className="text-primary hover:underline">
                    See them all in Leads
                  </Link>
                  .
                </p>
              ) : null}
            </CardContent>
          </Card>

          {past.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Moved to another strategy</CardTitle>
                <CardDescription>
                  These leads ran this strategy for a period. Whatever they did in that period still counts here.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {past.slice(0, 30).map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
                      <Link href={`/leads/${a.leadId}`} className="min-w-0 truncate hover:underline">
                        {a.lead?.name ?? "Lead"}
                      </Link>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {fmtDate(a.assignedAt)} - {fmtDate(a.endedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
