import { NextResponse } from "next/server";
import { z } from "zod";
import { db, fromRow, toRow, TABLES } from "@/lib/db";
import { CONTACT_METHOD_VALUES, STRATEGY_STATUS_VALUES, type Strategy } from "@/lib/types";

const Patch = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullish(),
  targetNiche: z.string().nullish(),
  targetCriteria: z.string().nullish(),
  channel: z.enum(CONTACT_METHOD_VALUES).optional(),
  openingMessage: z.string().nullish(),
  followUpApproach: z.string().nullish(),
  notes: z.string().nullish(),
  status: z.enum(STRATEGY_STATUS_VALUES).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid fields" }, { status: 400 });

  const res = await db().from(TABLES.strategies).update(toRow(parsed.data)).eq("id", id).select().maybeSingle();
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  if (!res.data) return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
  return NextResponse.json({ strategy: fromRow<Strategy>(res.data) });
}

/**
 * Archiving is the normal way to retire a strategy - it keeps every historical
 * number intact. Deleting is only allowed while a strategy has never been used,
 * so a mistyped draft can be cleaned up without losing reporting.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const used = await db()
    .from(TABLES.strategyAssignments)
    .select("id", { count: "exact", head: true })
    .eq("strategy_id", id);
  if (used.error) return NextResponse.json({ error: used.error.message }, { status: 500 });
  if ((used.count ?? 0) > 0) {
    return NextResponse.json(
      { error: "This strategy has lead history. Archive it instead so the numbers survive." },
      { status: 409 },
    );
  }

  const res = await db().from(TABLES.strategies).delete().eq("id", id);
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
