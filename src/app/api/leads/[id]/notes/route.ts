import { NextResponse } from "next/server";
import { z } from "zod";
import { db, fromRow, toRow, TABLES } from "@/lib/db";
import { logActivity } from "@/lib/sales";
import type { Note } from "@/lib/types";

const Body = z.object({ body: z.string().min(1).max(5000) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Note is empty" }, { status: 400 });

  const res = await db()
    .from(TABLES.notes)
    .insert(toRow({ leadId: id, body: parsed.data.body }))
    .select()
    .single();
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });

  await logActivity(id, "NOTE", "Note added", parsed.data.body.slice(0, 200));
  return NextResponse.json({ note: fromRow<Note>(res.data) });
}
