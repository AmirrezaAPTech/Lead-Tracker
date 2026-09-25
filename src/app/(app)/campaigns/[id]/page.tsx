import Link from "next/link";
import { notFound } from "next/navigation";
import { db, fromRow, fromRows, TABLES } from "@/lib/db";
import { fmtDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Campaign, LeadStatus, SearchRun } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CampaignDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [campaignRes, runsRes, countsRes] = await Promise.all([
    db().from(TABLES.campaigns).select("*").eq("id", id).maybeSingle(),
    db()
      .from(TABLES.searchRuns)
      .select("*")
      .eq("campaign_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    db().rpc("status_counts", { p_campaign_id: id }),
  ]);

  const campaign = fromRow<Campaign>(campaignRes.data);
  if (!campaign) notFound();

  const searchRuns = fromRows<SearchRun>(runsRes.data);
  const byStatus = ((countsRes.data ?? []) as { status: LeadStatus; count: number }[]).map((r) => ({
    status: r.status,
    count: Number(r.count),
  }));
  const total = byStatus.reduce((sum, r) => sum + r.count, 0);

  return (
    <div>
      <PageHeader
        title={campaign.name}
        subtitle={`${[campaign.district, campaign.city].filter(Boolean).join(", ")} - ${total} leads`}
      >
        <Button asChild size="sm" variant="outline">
          <Link href={`/review?campaign=${campaign.id}`}>Review this campaign</Link>
        </Button>
        <Button asChild size="sm">
          <Link href={`/leads?campaign=${campaign.id}`}>Open leads</Link>
        </Button>
      </PageHeader>

      <div className="grid gap-4 p-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {byStatus.map((row) => (
                <li key={row.status} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{row.status}</span>
                  <span className="tabnum">{row.count}</span>
                </li>
              ))}
              {byStatus.length === 0 ? <li className="text-xs text-muted-foreground">No leads yet.</li> : null}
            </ul>
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Queries</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {campaign.queries.map((q) => (
                  <span key={q} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                    {q}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Search runs</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="py-1 text-left">Query</th>
                  <th className="w-12 py-1 text-right">Found</th>
                  <th className="w-12 py-1 text-right">New</th>
                  <th className="w-12 py-1 text-right">Dupe</th>
                  <th className="w-12 py-1 text-right">Calls</th>
                  <th className="w-28 py-1 text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {searchRuns.map((r) => (
                  <tr key={r.id} className="border-t border-border/40">
                    <td className="py-1">
                      {r.query}
                      {r.error ? <span className="ml-1 text-rose-300">error</span> : null}
                    </td>
                    <td className="tabnum py-1 text-right">{r.resultCount}</td>
                    <td className="tabnum py-1 text-right text-emerald-400">{r.newCount}</td>
                    <td className="tabnum py-1 text-right text-muted-foreground">{r.dupeCount}</td>
                    <td className="tabnum py-1 text-right text-muted-foreground">{r.apiCalls}</td>
                    <td className="py-1 text-right text-muted-foreground">{fmtDateTime(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {searchRuns.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">No searches run yet.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
