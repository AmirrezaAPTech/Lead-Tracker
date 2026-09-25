import Link from "next/link";
import { PageHeader, EmptyState } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ComparePicker } from "@/components/strategy/compare-picker";
import { RateBar, SampleBadge, SAMPLE_SIZE_HINT } from "@/components/strategy/metric-bits";
import { STRATEGY_CHANNEL_LABEL } from "@/lib/constants";
import { DATE_RANGES, listStrategies, loadMetrics, metricsFor, pct, rangeToWindow, rates } from "@/lib/strategy";
import { cn, money } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { ids?: string; range?: string };

export default async function CompareStrategiesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const range = params.range ?? "all";

  const [all, metrics] = await Promise.all([listStrategies(), loadMetrics(rangeToWindow(range))]);

  const wanted = (params.ids ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);

  const byId = new Map(all.map((s) => [s.id, s]));
  const chosen = wanted.map((id) => byId.get(id)).filter((s): s is NonNullable<typeof s> => Boolean(s));

  const cols = chosen.map((s) => {
    const m = metricsFor(metrics, s.id);
    return { strategy: s, m, r: rates(m) };
  });

  // Only used to scale the bars; it never turns a small sample into a verdict.
  const bestResponse = Math.max(0, ...cols.map((c) => c.r.responseRate ?? 0));

  const ROWS: { label: string; render: (c: (typeof cols)[number]) => React.ReactNode }[] = [
    { label: "Leads assigned", render: (c) => c.m.assigned },
    { label: "Leads contacted", render: (c) => c.m.contacted },
    { label: "Responses", render: (c) => c.m.responses },
    {
      label: "Response rate",
      render: (c) => (
        <div className="space-y-1">
          <span>{pct(c.r.responseRate)}</span>
          <RateBar value={bestResponse ? (c.r.responseRate ?? 0) / bestResponse : 0} />
        </div>
      ),
    },
    { label: "Positive", render: (c) => c.m.positive },
    { label: "Positive of replies", render: (c) => pct(c.r.positiveRate) },
    { label: "Calls", render: (c) => c.m.calls },
    { label: "Demos", render: (c) => c.m.demos },
    { label: "Proposals", render: (c) => c.m.proposals },
    { label: "Won", render: (c) => c.m.won },
    { label: "Lost", render: (c) => c.m.lost },
    { label: "Close rate", render: (c) => pct(c.r.closeRate) },
    { label: "Revenue", render: (c) => money(c.m.revenue) },
    {
      label: "Avg deal value",
      render: (c) => (c.r.avgDealValue === null ? "--" : money(Math.round(c.r.avgDealValue))),
    },
    {
      label: "Revenue per contact",
      render: (c) => (c.r.revenuePerContact === null ? "--" : money(Math.round(c.r.revenuePerContact))),
    },
    {
      label: "Days to close",
      render: (c) => (c.m.avgDaysToClose === null ? "--" : c.m.avgDaysToClose.toFixed(1)),
    },
  ];

  return (
    <div>
      <PageHeader title="Compare strategies" subtitle="Pick 2 to 4 and read the counts side by side">
        <Button asChild size="sm" variant="outline">
          <Link href="/strategies">All strategies</Link>
        </Button>
      </PageHeader>

      <ComparePicker strategies={all.map((s) => ({ id: s.id, name: s.name }))} selected={wanted} />

      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-6 py-2">
        <span className="mr-1 text-[10px] uppercase tracking-wide text-muted-foreground">Window</span>
        {DATE_RANGES.map((d) => {
          const query = new URLSearchParams();
          if (params.ids) query.set("ids", params.ids);
          if (d.value !== "all") query.set("range", d.value);
          const qs = query.toString();
          return (
            <Link
              key={d.value}
              href={`/strategies/compare${qs ? `?${qs}` : ""}`}
              className={cn(
                "rounded border px-2 py-1 text-xs transition-colors",
                range === d.value
                  ? "border-primary/50 bg-primary/20 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {d.label}
            </Link>
          );
        })}
      </div>

      <div className="space-y-3 p-6">
        {cols.length < 2 ? (
          <EmptyState
            title="Choose at least two strategies"
            hint={
              all.length < 2
                ? "Create a second strategy first, then split a batch of qualified leads between them."
                : "Use the row above to pick the strategies you want side by side."
            }
          />
        ) : (
          <>
            <Card>
              <CardContent className="overflow-x-auto pt-4">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="w-44 px-2 py-2 text-left">Metric</th>
                      {cols.map((c) => (
                        <th key={c.strategy.id} className="px-2 py-2 text-left">
                          <Link href={`/strategies/${c.strategy.id}`} className="text-sm font-medium hover:underline">
                            {c.strategy.name}
                          </Link>
                          <div className="font-normal normal-case text-muted-foreground">
                            {STRATEGY_CHANNEL_LABEL[c.strategy.channel]}
                            {c.strategy.targetNiche ? ` - ${c.strategy.targetNiche}` : ""}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/50">
                      <td className="px-2 py-2 text-xs text-muted-foreground">Sample</td>
                      {cols.map((c) => (
                        <td key={c.strategy.id} className="px-2 py-2">
                          <SampleBadge contacted={c.m.contacted} />
                        </td>
                      ))}
                    </tr>
                    {ROWS.map((row) => (
                      <tr key={row.label} className="border-b border-border/50">
                        <td className="px-2 py-1.5 text-xs text-muted-foreground">{row.label}</td>
                        {cols.map((c) => (
                          <td key={c.strategy.id} className="tabnum px-2 py-1.5 text-xs">
                            {row.render(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <p className="text-[10px] text-muted-foreground">
              This table shows which strategy <em>appears</em> to be doing better in the recorded data. It is not a
              significance test and does not account for lead quality, timing or luck. {SAMPLE_SIZE_HINT}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
