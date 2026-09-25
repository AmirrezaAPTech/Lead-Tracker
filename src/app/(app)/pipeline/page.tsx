import { db, fromRows, TABLES } from "@/lib/db";
import { PageHeader } from "@/components/bits";
import { PipelineBoard, type BoardLead } from "@/components/pipeline-board";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const res = await db()
    .from(TABLES.leads)
    .select(
      "id, name, status, tier, score, neighborhood, next_follow_up_at, price_quoted, deal_value, has_website",
    )
    .neq("status", "REJECTED")
    .order("score", { ascending: false })
    .limit(600);

  if (res.error) throw new Error(`load pipeline: ${res.error.message}`);

  return (
    <div>
      <PageHeader title="Pipeline" subtitle="Drag a card to move it, or open the lead and use the status buttons." />
      <PipelineBoard leads={fromRows<BoardLead>(res.data)} />
    </div>
  );
}
