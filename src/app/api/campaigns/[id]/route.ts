import { NextResponse } from "next/server";
import { z } from "zod";
import { db, fromRow, toRow, TABLES } from "@/lib/db";
import type { Campaign } from "@/lib/types";

const Patch = z.object({
  name: z.string().min(1).optional(),
  city: z.string().optional(),
  district: z.string().nullish(),
  niche: z.string().nullish(),
  queries: z.array(z.string()).optional(),
  notes: z.string().nullish(),
  archived: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid fields" }, { status: 400 });

  const res = await db().from(TABLES.campaigns).update(toRow(parsed.data)).eq("id", id).select().maybeSingle();
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  if (!res.data) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  return NextResponse.json({ campaign: fromRow<Campaign>(res.data) });
}
