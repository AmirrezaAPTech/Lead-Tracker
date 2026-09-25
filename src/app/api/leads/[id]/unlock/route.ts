import { NextResponse } from "next/server";
import { z } from "zod";
import { db, fromRow, TABLES } from "@/lib/db";
import { logActivity } from "@/lib/sales";
import type { Lead } from "@/lib/types";

const Body = z.object({ fields: z.array(z.string()).optional() });

/**
 * Releases hand-edited columns back to Google, so the next enrichment or
 * re-import is allowed to refresh them again. Values are left as they are.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const found = await db().from(TABLES.leads).select("*").eq("id", id).maybeSingle();
  if (found.error) return NextResponse.json({ error: found.error.message }, { status: 500 });
  const lead = fromRow<Lead>(found.data);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const release = parsed.data.fields;
  const remaining = release ? (lead.manualFields ?? []).filter((f) => !release.includes(f)) : [];
  const released = (lead.manualFields ?? []).filter((f) => !remaining.includes(f));

  const res = await db().from(TABLES.leads).update({ manual_fields: remaining }).eq("id", id);
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });

  if (released.length) {
    await logActivity(id, "OTHER", `Released to Google: ${released.join(", ")}`);
  }

  return NextResponse.json({ ok: true, released, manualFields: remaining });
}
