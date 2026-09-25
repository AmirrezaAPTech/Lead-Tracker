import Link from "next/link";
import { db, fromRows, TABLES } from "@/lib/db";
import { applyLeadFilters, applyLeadSort, restrictLeadIds, type LeadFilters } from "@/lib/lead-query";
import { PageHeader, EmptyState } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { LeadFilters as FilterBar } from "@/components/lead-filters";
import { LeadTable, type LeadRow } from "@/components/lead-table";
import { listStrategies } from "@/lib/strategy";
import type { Campaign } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

const LIST_COLUMNS = [
  "id",
  "name",
  "category",
  "neighborhood",
  "district",
  "rating",
  "review_count",
  "has_website",
  "website",
  "website_score",
  "website_issues",
  "instagram_url",
  "instagram_username",
  "phone",
  "email",
  "maps_url",
  "score",
  "tier",
  "status",
  "next_follow_up_at",
  "pinned",
].join(", ");

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<LeadFilters & { page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const leadIds = await restrictLeadIds(params);

  const base = db().from(TABLES.leads).select(LIST_COLUMNS, { count: "exact" });
  const filtered = applyLeadFilters(base as never, params, leadIds);
  const query = applyLeadSort(filtered, params.sort).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const [res, campaignRes, areaRes, strategyList] = await Promise.all([
    query,
    db().from(TABLES.campaigns).select("id, name").eq("archived", false).order("name"),
    db().rpc("lead_neighborhoods"),
    // Archived strategies stay out of the bulk bar: they keep their history but
    // are not offered for new assignments.
    listStrategies(false),
  ]);

  if (res.error) throw new Error(`load leads: ${res.error.message}`);

  const leads = fromRows<LeadRow>(res.data as unknown as Record<string, unknown>[]);
  const total = res.count ?? leads.length;
  const pages = Math.ceil(total / PAGE_SIZE);
  const campaigns = fromRows<Pick<Campaign, "id" | "name">>(campaignRes.data);
  const neighborhoods = ((areaRes.data ?? []) as { neighborhood: string }[]).map((a) => a.neighborhood);
  const strategies = strategyList.map((st) => ({ id: st.id, name: st.name }));

  const pageHref = (n: number) =>
    `/leads?${new URLSearchParams({ ...(params as Record<string, string>), page: String(n) })}`;

  return (
    <div>
      <PageHeader title="Leads" subtitle={`${total} matching`}>
        <Button asChild size="sm" variant="outline">
          <Link href="/review">Review queue</Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/discover">Find leads</Link>
        </Button>
      </PageHeader>

      <FilterBar campaigns={campaigns} neighborhoods={neighborhoods} strategies={strategies} />

      {leads.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title="No leads match these filters"
            hint="Clear the filters, or import a new batch from Discover."
          />
        </div>
      ) : (
        <>
          <LeadTable leads={leads} strategies={strategies} />
          {pages > 1 ? (
            <div className="flex items-center justify-between px-6 py-3 text-xs text-muted-foreground">
              <span className="tabnum">
                Page {page} of {pages}
              </span>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Button size="xs" variant="outline" asChild>
                    <Link href={pageHref(page - 1)}>Previous</Link>
                  </Button>
                ) : null}
                {page < pages ? (
                  <Button size="xs" variant="outline" asChild>
                    <Link href={pageHref(page + 1)}>Next</Link>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
