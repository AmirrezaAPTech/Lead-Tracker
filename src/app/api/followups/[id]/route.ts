import { NextResponse } from "next/server";
import { z } from "zod";
import { db, fromRow, TABLES } from "@/lib/db";
import { addDays, logActivity, markContacted } from "@/lib/sales";
import type { FollowUp } from "@/lib/types";

const Body = z.object({
  action: z.enum(["done", "skip", "snooze"]),
  days: z.number().min(1).max(60).default(3),
  note: z.string().optional(),
});

/** Follow-ups are only ever advanced by hand - nothing is auto-sent. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const found = await db().from(TABLES.followUps).select("*").eq("id", id).maybeSingle();
  if (found.error) return NextResponse.json({ error: found.error.message }, { status: 500 });
  const followUp = fromRow<FollowUp>(found.data);
  if (!followUp) return NextResponse.json({ error: "Follow-up not found" }, { status: 404 });

  if (parsed.data.action === "done") {
    const lead = await markContacted(
      followUp.leadId,
      followUp.channel ?? "INSTAGRAM",
      parsed.data.note ?? followUp.action ?? undefined,
    );
    return NextResponse.json({ lead });
  }

  if (parsed.data.action === "skip") {
    const now = new Date().toISOString();
    const a = await db().from(TABLES.followUps).update({ skipped: true, done_at: now }).eq("id", id);
    if (a.error) return NextResponse.json({ error: a.error.message }, { status: 500 });
    const b = await db().from(TABLES.leads).update({ next_follow_up_at: null }).eq("id", followUp.leadId);
    if (b.error) return NextResponse.json({ error: b.error.message }, { status: 500 });
    await logActivity(followUp.leadId, "FOLLOW_UP", "Follow-up skipped", parsed.data.note);
    return NextResponse.json({ ok: true });
  }

  const dueAt = addDays(new Date(), parsed.data.days).toISOString();
  const a = await db().from(TABLES.followUps).update({ due_at: dueAt }).eq("id", id);
  if (a.error) return NextResponse.json({ error: a.error.message }, { status: 500 });
  const b = await db().from(TABLES.leads).update({ next_follow_up_at: dueAt }).eq("id", followUp.leadId);
  if (b.error) return NextResponse.json({ error: b.error.message }, { status: 500 });

  await logActivity(followUp.leadId, "FOLLOW_UP", `Snoozed ${parsed.data.days} days`);
  return NextResponse.json({ ok: true, dueAt });
}
