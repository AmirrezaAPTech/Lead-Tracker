import { NextResponse } from "next/server";
import { z } from "zod";
import { db, toRow, TABLES } from "@/lib/db";
import { getScoringConfig, rescoreAll } from "@/lib/scoring";

const Body = z.object({
  noWebsite: z.coerce.number().int().min(0).max(100),
  websiteProblems: z.coerce.number().int().min(0).max(100),
  instagramActive: z.coerce.number().int().min(0).max(100),
  instagramFollowers: z.coerce.number().int().min(0).max(100),
  manyReviews: z.coerce.number().int().min(0).max(100),
  highRating: z.coerce.number().int().min(0).max(100),
  premiumNeighborhood: z.coerce.number().int().min(0).max(100),
  appointmentBased: z.coerce.number().int().min(0).max(100),
  followerThreshold: z.coerce.number().int().min(0),
  reviewThreshold: z.coerce.number().int().min(0),
  ratingThreshold: z.coerce.number().min(0).max(5),
  hotMin: z.coerce.number().int().min(0).max(100),
  goodMin: z.coerce.number().int().min(0).max(100),
  maybeMin: z.coerce.number().int().min(0).max(100),
  premiumNeighborhoods: z.array(z.string()),
  appointmentTypes: z.array(z.string()),
  followUpDays: z.array(z.coerce.number().int().min(1).max(90)).min(1).max(6),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid settings", detail: parsed.error.issues }, { status: 400 });
  }

  // Make sure the row exists even if the migration seed was skipped.
  await getScoringConfig();

  const clean = {
    ...parsed.data,
    premiumNeighborhoods: parsed.data.premiumNeighborhoods.map((s) => s.trim()).filter(Boolean),
    appointmentTypes: parsed.data.appointmentTypes.map((s) => s.trim()).filter(Boolean),
  };

  const res = await db().from(TABLES.scoringConfig).update(toRow(clean)).eq("id", "default");
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });

  const result = await rescoreAll();
  return NextResponse.json({ ok: true, ...result });
}
