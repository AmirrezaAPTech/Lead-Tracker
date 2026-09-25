import { db, fromRows, TABLES } from "@/lib/db";
import { PageHeader } from "@/components/bits";
import { DiscoverForm } from "@/components/discover-form";
import type { Campaign } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const res = await db()
    .from(TABLES.campaigns)
    .select("id, name, queries")
    .eq("archived", false)
    .order("created_at", { ascending: false });

  const campaigns = fromRows<Pick<Campaign, "id" | "name" | "queries">>(res.data);
  const configured = Boolean(process.env.GOOGLE_PLACES_API_KEY);

  return (
    <div>
      <PageHeader
        title="Discover"
        subtitle={
          configured
            ? "Official Google Places API. Duplicates are filtered by Place ID."
            : "GOOGLE_PLACES_API_KEY is not set - add it to .env before searching."
        }
      />
      <DiscoverForm campaigns={campaigns} />
    </div>
  );
}
