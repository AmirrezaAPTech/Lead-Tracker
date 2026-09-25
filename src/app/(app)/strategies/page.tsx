import Link from "next/link";
import { PageHeader, EmptyState } from "@/components/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StrategyForm } from "@/components/strategy/strategy-form";
import { StrategyFilters } from "@/components/strategy/strategy-filters";
import { Metric, Rate, SampleBadge } from "@/components/strategy/metric-bits";
import { STRATEGY_CHANNEL_LABEL, STRATEGY_STATUS_CLASS, STRATEGY_STATUS_LABEL } from "@/lib/constants";
import { listStrategies, loadMetrics, metricsFor, rangeToWindow } from "@/lib/strategy";
import { money } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { range?: string; channel?: string; niche?: string; status?: string };

export default async function StrategiesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const status = params.status ?? "ACTIVE";

  const [all, metrics] = await Promise.all([listStrategies(), loadMetrics(rangeToWindow(params.range))]);

  const niches = Array.from(new Set(all.map((s) => s.targetNiche).filter((n): n is string => Boolean(n)))).sort();

  const strategies = all.filter((s) => {
    if (status !== "all" && s.status !== status) return false;
    if (params.channel && params.channel !== "all" && s.channel !== params.channel) return false;
    if (params.niche && params.niche !== "all" && s.targetNiche !== params.niche) return false;
    return true;
  });

  const assignable = all.filter((s) => s.status === "ACTIVE");

  return (
    <div>
      <PageHeader title="Strategies" subtitle={`${strategies.length} shown - ${assignable.length} active`}>
        <Button asChild size="sm" variant="outline">
          <Link href="/strategies/compare">Compare</Link>
        </Button>
      </PageHeader>

      <StrategyFilters niches={niches} />

      <div className="space-y-3 p-6">
        <StrategyForm />

        {strategies.length === 0 ? (
          <EmptyState
            title="No strategies here yet"
            hint="A strategy is HOW you approach a lead - the opening message and the follow-up plan. Create two or three, split a batch of qualified leads between them, and the numbers below will tell you which conversations actually start."
          />
        ) : (
          strategies.map((s) => {
            const m = metricsFor(metrics, s.id);
            return (
              <Card key={s.id}>
                <CardContent className="space-y-3 pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/strategies/${s.id}`} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                    <Badge className={STRATEGY_STATUS_CLASS[s.status]}>{STRATEGY_STATUS_LABEL[s.status]}</Badge>
                    <Badge className="border-border bg-muted/40 text-muted-foreground">
                      {STRATEGY_CHANNEL_LABEL[s.channel]}
                    </Badge>
                    {s.targetNiche ? (
                      <span className="text-xs text-muted-foreground">{s.targetNiche}</span>
                    ) : null}
                    <SampleBadge contacted={m.contacted} className="ml-auto" />
                  </div>

                  {s.description ? <p className="text-xs text-muted-foreground">{s.description}</p> : null}

                  <div className="grid grid-cols-3 gap-2 md:grid-cols-5 xl:grid-cols-9">
                    <Metric label="Assigned" value={m.assigned} />
                    <Metric label="Contacted" value={m.contacted} />
                    <Metric label="Responses" value={m.responses} />
                    <Metric label="Positive" value={m.positive} />
                    <Metric label="Calls" value={m.calls} />
                    <Metric label="Demos" value={m.demos} />
                    <Metric label="Proposals" value={m.proposals} />
                    <Metric label="Won" value={m.won} accent="text-emerald-400" />
                    <Metric label="Revenue" value={money(m.revenue)} accent="text-emerald-400" />
                  </div>

                  <div className="grid gap-x-6 md:grid-cols-2 xl:grid-cols-3">
                    <Rate label="Response rate" numerator={m.responses} denominator={m.contacted} />
                    <Rate label="Positive of replies" numerator={m.positive} denominator={m.responses} />
                    <Rate label="Call rate" numerator={m.calls} denominator={m.contacted} />
                    <Rate label="Demo rate" numerator={m.demos} denominator={m.contacted} />
                    <Rate label="Proposal rate" numerator={m.proposals} denominator={m.contacted} />
                    <Rate label="Close rate" numerator={m.won} denominator={m.contacted} />
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}

        {strategies.length ? (
          <p className="text-[10px] text-muted-foreground">
            Percentages are shown next to the counts that produced them. Small samples are labelled, and no result
            here is a statistical claim - a 20% response rate from 10 contacts is a hint about what to try next,
            not proof.
          </p>
        ) : null}
      </div>
    </div>
  );
}
