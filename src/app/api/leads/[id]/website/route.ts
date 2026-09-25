import { NextResponse } from "next/server";
import { db, fromRow, toRow, TABLES } from "@/lib/db";
import { analyzeWebsite, recomputeWebsiteHealth } from "@/lib/website";
import { rescoreLead } from "@/lib/scoring";
import { extractInstagramUsername } from "@/lib/place-mapper";
import { logActivity } from "@/lib/sales";
import type { Lead } from "@/lib/types";

export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await db().from(TABLES.leads).select("*").eq("id", id).maybeSingle();
  if (found.error) return NextResponse.json({ error: found.error.message }, { status: 500 });

  const lead = fromRow<Lead>(found.data);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (!lead.website) return NextResponse.json({ error: "This lead has no website" }, { status: 400 });

  const result = await analyzeWebsite(lead.website);

  const manual = new Set(lead.manualFields ?? []);
  const data: Record<string, unknown> = {
    httpsOk: result.httpsOk,
    httpStatus: result.httpStatus,
    pageTitle: result.pageTitle,
    metaDescription: result.metaDescription,
    h1: result.h1,
    mobileFriendly: result.mobileFriendly,
    whatsappCta: result.whatsappCta,
    phoneCta: result.phoneCta,
    bookingCta: result.bookingCta,
    websiteScore: result.websiteScore,
    websiteIssues: result.websiteIssues,
    websiteError: result.websiteError,
    websiteMs: result.websiteMs,
    websiteCheckedAt: new Date().toISOString(),
  };

  // Signals the operator corrected by hand stay as they are, and the issue list
  // is rebuilt so the score matches what is actually on the lead.
  for (const field of manual) delete data[field];
  if ([...manual].some((f) => f in result)) {
    const health = recomputeWebsiteHealth({ ...lead, ...data } as never);
    data.websiteIssues = health.websiteIssues;
    data.websiteScore = health.websiteScore;
  }

  // An Instagram link on the business's own site is a legitimate discovery.
  if (result.instagramUrl && !lead.instagramUrl) {
    data.instagramUrl = result.instagramUrl;
    data.instagramUsername = extractInstagramUsername(result.instagramUrl) ?? null;
    data.instagramActive = true;
  }

  const write = await db().from(TABLES.leads).update(toRow(data)).eq("id", id);
  if (write.error) return NextResponse.json({ error: write.error.message }, { status: 500 });

  // Log what was actually stored, which can differ from the raw scan when the
  // operator has corrected a signal by hand.
  const storedScore = (data.websiteScore as number | null) ?? result.websiteScore;
  const storedIssues = (data.websiteIssues as string[] | undefined) ?? result.websiteIssues;
  await logActivity(
    id,
    "WEBSITE_ANALYSIS",
    `Website checked: ${storedScore ?? "-"}/100${manual.size ? " (with your corrections)" : ""}`,
    storedIssues.join(", ") || "No obvious problems",
  );

  const updated = await rescoreLead(id);
  return NextResponse.json({ lead: updated, analysis: result });
}
