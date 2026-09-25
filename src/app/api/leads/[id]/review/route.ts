import { NextResponse } from "next/server";
import { z } from "zod";
import { db, fromRow, toRow, TABLES } from "@/lib/db";
import { logActivity } from "@/lib/sales";
import { REJECT_REASON_VALUES, type Lead } from "@/lib/types";

const Body = z.object({
  action: z.enum(["keep", "reject", "undo"]),
  reason: z.enum(REJECT_REASON_VALUES).optional(),
  note: z.string().optional(),
});

/** Keep / reject from the review screen. Rejected leads are kept, never deleted. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { action, reason, note } = parsed.data;

  const patch =
    action === "undo"
      ? { status: "NEW", reviewedAt: null, rejectReason: null, rejectNote: null }
      : {
          status: action === "keep" ? "QUALIFIED" : "REJECTED",
          reviewedAt: new Date().toISOString(),
          rejectReason: action === "keep" ? null : (reason ?? "OTHER"),
          rejectNote: action === "keep" ? null : (note ?? null),
        };

  const res = await db().from(TABLES.leads).update(toRow(patch)).eq("id", id).select().maybeSingle();
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  if (!res.data) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  await logActivity(
    id,
    "REVIEWED",
    action === "undo" ? "Review undone" : action === "keep" ? "Kept - qualified" : `Rejected - ${reason ?? "OTHER"}`,
    note,
  );

  return NextResponse.json({ lead: fromRow<Lead>(res.data) });
}
