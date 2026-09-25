import { NextResponse } from "next/server";
import { z } from "zod";
import { db, fromRow, toRow, TABLES } from "@/lib/db";
import type { Campaign } from "@/lib/types";

const Body = z.object({
  name: z.string().min(1),
  city: z.string().default("Istanbul"),
  district: z.string().optional(),
  niche: z.string().optional(),
  queries: z.array(z.string().min(1)).default([]),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid campaign" }, { status: 400 });

  const res = await db().from(TABLES.campaigns).insert(toRow(parsed.data)).select().single();
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  return NextResponse.json({ campaign: fromRow<Campaign>(res.data) });
}
