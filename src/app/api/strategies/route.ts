import { NextResponse } from "next/server";
import { z } from "zod";
import { db, fromRow, toRow, TABLES } from "@/lib/db";
import { CONTACT_METHOD_VALUES, type Strategy } from "@/lib/types";

/**
 * Only the name is required. A strategy has to be cheap to create, otherwise
 * the next test never gets written down.
 */
const Body = z.object({
  name: z.string().min(1),
  description: z.string().nullish(),
  targetNiche: z.string().nullish(),
  targetCriteria: z.string().nullish(),
  channel: z.enum(CONTACT_METHOD_VALUES).default("INSTAGRAM"),
  openingMessage: z.string().nullish(),
  followUpApproach: z.string().nullish(),
  notes: z.string().nullish(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid strategy" }, { status: 400 });

  const res = await db().from(TABLES.strategies).insert(toRow(parsed.data)).select().single();
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  return NextResponse.json({ strategy: fromRow<Strategy>(res.data) });
}
