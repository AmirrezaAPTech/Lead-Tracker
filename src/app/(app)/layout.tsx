import { requireAuth } from "@/lib/auth";
import { db, TABLES } from "@/lib/db";
import { endOfToday } from "@/lib/utils";
import { Sidebar } from "@/components/sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();

  const [review, followUps] = await Promise.all([
    db().from(TABLES.leads).select("id", { count: "exact", head: true }).in("status", ["NEW", "REVIEW"]),
    db()
      .from(TABLES.leads)
      .select("id", { count: "exact", head: true })
      .lte("next_follow_up_at", endOfToday().toISOString())
      .not("status", "in", "(WON,LOST,REJECTED)"),
  ]);

  return (
    <div className="flex min-h-screen">
      <Sidebar reviewCount={review.count ?? 0} followUpCount={followUps.count ?? 0} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
