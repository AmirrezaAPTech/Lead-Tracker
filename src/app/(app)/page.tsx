import Link from "next/link";
import { db, fromRows, TABLES } from "@/lib/db";
import { cn, endOfToday, money, relativeDays } from "@/lib/utils";
import { PIPELINE, STATUS_CLASS, STATUS_LABEL } from "@/lib/constants";
import { PageHeader, Stat, StatusBadge, TierBadge, EmptyState } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QuickActions } from "@/components/quick-actions";
import { SampleBadge } from "@/components/strategy/metric-bits";
import { listStrategies, loadMetrics, metricsFor, pct, rates } from "@/lib/strategy";
import type { Activity, Lead, LeadStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const ACTION_COLUMNS =
  "id, name, status, tier, score, neighborhood, phone, website, maps_url, instagram_url, instagram_username, email";

type ActionLead = Pick<
  Lead,
  | "id"
  | "name"
  | "status"
  | "tier"
  | "score"
  | "neighborhood"
  | "phone"
  | "website"
  | "mapsUrl"
  | "instagramUrl"
  | "instagramUsername"
  | "email"
> & { nextFollowUpAt?: string | null; followUpCount?: number };

export default async function DashboardPage() {
  const today = endOfToday().toISOString();

  const [counts, dueRes, hotRes, wonRes, activityRes, strategyList, strategyMetrics] = await Promise.all([
    db().rpc("status_counts"),
    db()
      .from(TABLES.leads)
      .select(ACTION_COLUMNS + ", next_follow_up_at, follow_up_count")
      .not("status", "in", "(WON,LOST,REJECTED)")
      .lte("next_follow_up_at", today)
      .order("next_follow_up_at", { ascending: true })
      .limit(8),
    db()
      .from(TABLES.leads)
      .select(ACTION_COLUMNS)
      .eq("status", "QUALIFIED")
      .is("first_contact_at", null)
      .order("score", { ascending: false })
      .limit(8),
    db().from(TABLES.leads).select("deal_value").eq("status", "WON"),
    db()
      .from(TABLES.activities)
      .select("id, lead_id, title, created_at, leads(name)")
      .order("created_at", { ascending: false })
      .limit(10),
    listStrategies(false),
    loadMetrics(),
  ]);

  if (counts.error) throw new Error(`status counts: ${counts.error.message}`);

  const byStatus = new Map(
    ((counts.data ?? []) as { status: LeadStatus; count: number }[]).map((r) => [r.status, Number(r.count)]),
  );
  const count = (s: LeadStatus) => byStatus.get(s) ?? 0;
  const total = Array.from(byStatus.values()).reduce((a, b) => a + b, 0);
  const reviewQueue = count("NEW") + count("REVIEW");
  const maxStage = Math.max(1, ...PIPELINE.map((s) => count(s)));

  const dueToday = fromRows<ActionLead>(dueRes.data as unknown as Record<string, unknown>[]);
  const hotToContact = fromRows<ActionLead>(hotRes.data as unknown as Record<string, unknown>[]);
  const wonLeads = ((wonRes.data ?? []) as { deal_value: number | null }[]).map((r) => r.deal_value ?? 0);
  const revenue = wonLeads.reduce((a, b) => a + b, 0);
  const wonCount = wonLeads.length;

  const recent = fromRows<Activity & { leads: { name: string } | null }>(
    activityRes.data as unknown as Record<string, unknown>[],
  );

  // A glance at what is working, not an analytics screen. Sorted by response
  // rate because that is the first signal an approach produces; leads with no
  // contacts yet sort last rather than pretending to be a 0%.
  const strategyRows = strategyList
    .map((s) => {
      const m = metricsFor(strategyMetrics, s.id);
      return { strategy: s, m, r: rates(m) };
    })
    .filter((row) => row.m.assigned > 0)
    .sort((a, b) => (b.r.responseRate ?? -1) - (a.r.responseRate ?? -1))
    .slice(0, 5);

  return (
    <div>
      <PageHeader title="Today" subtitle={`${total} leads in the database`}>
        <Button asChild size="sm" variant="outline">
          <Link href="/discover">Find leads</Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/review">Review queue ({reviewQueue})</Link>
        </Button>
      </PageHeader>

      <div className="space-y-5 p-6">
        {/* Actions first. This is a work screen, not an analytics screen. */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Follow-ups due today</CardTitle>
              <Link href="/followups" className="text-xs text-primary hover:underline">
                All follow-ups
              </Link>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {dueToday.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">Nothing due. Good.</p>
              ) : (
                dueToday.map((lead) => (
                  <div key={lead.id} className="flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-1.5">
                    <Link href={`/leads/${lead.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                      {lead.name}
                    </Link>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      #{(lead.followUpCount ?? 0) + 1} - {relativeDays(lead.nextFollowUpAt)}
                    </span>
                    <StatusBadge status={lead.status} />
                    <QuickActions lead={lead} compact />
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Qualified, not contacted yet</CardTitle>
              <Link href="/leads?status=QUALIFIED" className="text-xs text-primary hover:underline">
                All qualified
              </Link>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {hotToContact.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">Nothing waiting. Review some new leads.</p>
              ) : (
                hotToContact.map((lead) => (
                  <div key={lead.id} className="flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-1.5">
                    <TierBadge tier={lead.tier} score={lead.score} />
                    <Link href={`/leads/${lead.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                      {lead.name}
                    </Link>
                    <span className="hidden shrink-0 text-[10px] text-muted-foreground xl:inline">
                      {lead.neighborhood ?? ""}
                    </span>
                    <QuickActions lead={lead} compact />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <Stat label="New" value={count("NEW")} href="/leads?status=NEW" />
          <Stat label="Needs review" value={reviewQueue} href="/review" accent={reviewQueue ? "text-amber-400" : ""} />
          <Stat label="Qualified" value={count("QUALIFIED")} href="/leads?status=QUALIFIED" />
          <Stat label="Contacted" value={count("CONTACTED")} href="/leads?status=CONTACTED" />
          <Stat label="Responded" value={count("RESPONDED")} href="/leads?status=RESPONDED" />
          <Stat label="Calls" value={count("CALL")} href="/leads?status=CALL" />
          <Stat label="Demos" value={count("DEMO")} href="/leads?status=DEMO" />
          <Stat label="Proposals" value={count("PROPOSAL")} href="/leads?status=PROPOSAL" />
          <Stat label="Won" value={count("WON")} href="/leads?status=WON" accent="text-emerald-400" />
          <Stat label="Lost" value={count("LOST")} href="/leads?status=LOST" />
          <Stat label="Rejected" value={count("REJECTED")} href="/leads?status=REJECTED" />
          <Stat
            label="Revenue"
            value={money(revenue)}
            hint={`${wonCount} won`}
            accent="text-emerald-400"
          />
          <Stat label="Follow-ups due" value={dueToday.length} href="/followups" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {PIPELINE.map((status) => {
              const n = count(status);
              return (
                <Link
                  key={status}
                  href={`/leads?status=${status}`}
                  className="flex items-center gap-3 rounded px-1 py-1 hover:bg-accent/40"
                >
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{STATUS_LABEL[status]}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn("block h-full rounded-full border", STATUS_CLASS[status])}
                      style={{ width: `${Math.round((n / maxStage) * 100)}%` }}
                    />
                  </span>
                  <span className="tabnum w-10 shrink-0 text-right text-xs">{n}</span>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        {strategyRows.length ? (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Outreach performance</CardTitle>
              <Link href="/strategies/compare" className="text-xs text-primary hover:underline">
                Compare strategies
              </Link>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Strategy</th>
                    <th className="w-20 px-2 py-1.5 text-right">Contacted</th>
                    <th className="w-24 px-2 py-1.5 text-right">Response</th>
                    <th className="w-16 px-2 py-1.5 text-right">Calls</th>
                    <th className="w-16 px-2 py-1.5 text-right">Demos</th>
                    <th className="w-16 px-2 py-1.5 text-right">Won</th>
                    <th className="w-24 px-2 py-1.5 text-right">Revenue</th>
                    <th className="w-44 px-2 py-1.5 text-left">Sample</th>
                  </tr>
                </thead>
                <tbody>
                  {strategyRows.map(({ strategy, m, r }) => (
                    <tr key={strategy.id} className="border-b border-border/50">
                      <td className="max-w-0 px-2 py-1.5">
                        <Link href={`/strategies/${strategy.id}`} className="block truncate hover:underline">
                          {strategy.name}
                        </Link>
                      </td>
                      <td className="tabnum px-2 py-1.5 text-right text-xs">{m.contacted}</td>
                      <td className="tabnum px-2 py-1.5 text-right text-xs">
                        {m.responses} / {m.contacted}
                        <span className="ml-1.5 font-semibold">{pct(r.responseRate)}</span>
                      </td>
                      <td className="tabnum px-2 py-1.5 text-right text-xs">{m.calls}</td>
                      <td className="tabnum px-2 py-1.5 text-right text-xs">{m.demos}</td>
                      <td className="tabnum px-2 py-1.5 text-right text-xs text-emerald-400">{m.won}</td>
                      <td className="tabnum px-2 py-1.5 text-right text-xs text-emerald-400">{money(m.revenue)}</td>
                      <td className="px-2 py-1.5">
                        <SampleBadge contacted={m.contacted} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <EmptyState title="No activity yet" hint="Import leads from Discover to get started." />
            ) : (
              <ul className="space-y-1">
                {recent.map((a) => (
                  <li key={a.id} className="flex items-baseline gap-2 text-xs">
                    <span className="w-24 shrink-0 text-muted-foreground">{relativeDays(a.createdAt)}</span>
                    <Link href={`/leads/${a.leadId}`} className="shrink-0 font-medium hover:underline">
                      {a.leads?.name ?? "Lead"}
                    </Link>
                    <span className="truncate text-muted-foreground">{a.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
