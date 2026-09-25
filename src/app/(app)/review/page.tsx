import Link from "next/link";
import { db, fromRows, TABLES } from "@/lib/db";
import { campaignLeadIds } from "@/lib/lead-query";
import { PageHeader, EmptyState } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { ReviewDeck, type ReviewLead } from "@/components/review-deck";

export const dynamic = "force-dynamic";

const REVIEW_COLUMNS = [
  "id",
  "name",
  "category",
  "neighborhood",
  "district",
  "city",
  "address",
  "rating",
  "review_count",
  "phone",
  "email",
  "website",
  "has_website",
  "website_score",
  "website_issues",
  "website_checked_at",
  "maps_url",
  "instagram_url",
  "instagram_username",
  "instagram_followers",
  "instagram_active",
  "business_status",
  "score",
  "tier",
  "score_reasons",
  "status",
  "created_at",
].join(", ");

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ campaign?: string }> }) {
  const { campaign } = await searchParams;
  const leadIds = await campaignLeadIds(campaign);

  let query = db()
    .from(TABLES.leads)
    .select(REVIEW_COLUMNS)
    .in("status", ["NEW", "REVIEW"])
    .order("score", { ascending: false })
    .order("review_count", { ascending: false })
    .limit(60);

  if (leadIds) {
    query = query.in("id", leadIds.length ? leadIds : ["00000000-0000-0000-0000-000000000000"]);
  }

  const [res, total] = await Promise.all([
    query,
    db().from(TABLES.leads).select("id", { count: "exact", head: true }).in("status", ["NEW", "REVIEW"]),
  ]);

  if (res.error) throw new Error(`load review queue: ${res.error.message}`);
  const leads = fromRows<ReviewLead>(res.data as unknown as Record<string, unknown>[]);

  if (!leads.length) {
    return (
      <div>
        <PageHeader title="Review" subtitle="Queue is empty" />
        <div className="p-6">
          <EmptyState
            title="Nothing left to review"
            hint="Every imported lead has been kept or rejected. Run a new search to fill the queue."
            action={
              <Button asChild size="sm">
                <Link href="/discover">Find more leads</Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return <ReviewDeck leads={leads} remaining={total.count ?? leads.length} />;
}
