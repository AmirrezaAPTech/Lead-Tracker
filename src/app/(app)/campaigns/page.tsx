import Link from "next/link";
import { db, fromRows, TABLES } from "@/lib/db";
import { fmtDate } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/bits";
import { CampaignForm } from "@/components/campaign-form";
import { Card, CardContent } from "@/components/ui/card";
import type { Campaign, LeadStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const res = await db()
    .from(TABLES.campaigns)
    .select("*, search_runs(count)")
    .eq("archived", false)
    .order("created_at", { ascending: false });
  if (res.error) throw new Error(`load campaigns: ${res.error.message}`);

  const campaigns = fromRows<Campaign & { searchRuns: { count: number }[] }>(
    res.data as unknown as Record<string, unknown>[],
  );

  const stats = await Promise.all(
    campaigns.map(async (c) => {
      const counts = await db().rpc("status_counts", { p_campaign_id: c.id });
      if (counts.error) throw new Error(`campaign counts: ${counts.error.message}`);
      const rows = (counts.data ?? []) as { status: LeadStatus; count: number }[];
      const by = new Map(rows.map((r) => [r.status, Number(r.count)]));
      const leads = rows.reduce((sum, r) => sum + Number(r.count), 0);
      const contacted = (["CONTACTED", "RESPONDED", "CALL", "DEMO", "PROPOSAL", "WON", "LOST"] as LeadStatus[]).reduce(
        (sum, s) => sum + (by.get(s) ?? 0),
        0,
      );
      return { id: c.id, leads, qualified: by.get("QUALIFIED") ?? 0, contacted, won: by.get("WON") ?? 0 };
    }),
  );

  const statMap = new Map(stats.map((s) => [s.id, s]));

  return (
    <div>
      <PageHeader title="Campaigns" subtitle={`${campaigns.length} active`}>
        <CampaignForm />
      </PageHeader>

      <div className="space-y-3 p-6">
        {campaigns.length === 0 ? (
          <EmptyState
            title="No campaigns yet"
            hint="A campaign groups the queries you run for one area, so you can tell which searches produce real clients."
          />
        ) : (
          campaigns.map((c) => {
            const s = statMap.get(c.id);
            const runs = c.searchRuns?.[0]?.count ?? 0;
            return (
              <Card key={c.id}>
                <CardContent className="flex flex-wrap items-center gap-4 pt-4">
                  <div className="min-w-0 flex-1">
                    <Link href={`/campaigns/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {[c.district, c.city].filter(Boolean).join(", ")} - {c.queries.length} queries - {runs} searches -
                      created {fmtDate(c.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-4 text-center">
                    <div>
                      <div className="tabnum text-lg font-semibold">{s?.leads ?? 0}</div>
                      <div className="text-[10px] uppercase text-muted-foreground">Leads</div>
                    </div>
                    <div>
                      <div className="tabnum text-lg font-semibold">{s?.qualified ?? 0}</div>
                      <div className="text-[10px] uppercase text-muted-foreground">Qualified</div>
                    </div>
                    <div>
                      <div className="tabnum text-lg font-semibold">{s?.contacted ?? 0}</div>
                      <div className="text-[10px] uppercase text-muted-foreground">Contacted</div>
                    </div>
                    <div>
                      <div className="tabnum text-lg font-semibold text-emerald-400">{s?.won ?? 0}</div>
                      <div className="text-[10px] uppercase text-muted-foreground">Won</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
