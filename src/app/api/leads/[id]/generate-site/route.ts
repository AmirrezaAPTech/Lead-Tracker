import { NextResponse } from "next/server";
import { z } from "zod";
import { db, fromRow, toRow, TABLES } from "@/lib/db";
import { placeDetailsForSite, type PlaceResult } from "@/lib/places";
import { buildSalonConfig, writeSite } from "@/lib/site-generator";
import { logActivity } from "@/lib/sales";
import type { Lead } from "@/lib/types";

export const maxDuration = 60;

/** Everything is optional: a bare POST still generates from the Google name. */
const bodySchema = z.object({ name: z.string().trim().min(1).max(80).optional() });

/**
 * One click: generates a complete, presentable website for this lead in the
 * sibling salon-template project — real contact data, opening hours and Google
 * reviews, house copy and default media everywhere else. Regenerating is safe:
 * the lead's own config file is overwritten, media already uploaded stays.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid business name" }, { status: 400 });

  const found = await db().from(TABLES.leads).select("*").eq("id", id).maybeSingle();
  if (found.error) return NextResponse.json({ error: found.error.message }, { status: 500 });

  const lead = fromRow<Lead>(found.data);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  // Real hours and reviews for the site. One paid call; a failure never blocks
  // generation — enrichment data cached on the lead is the fallback.
  let place: PlaceResult | null = null;
  const notes: string[] = [];
  try {
    place = await placeDetailsForSite(lead.placeId);
  } catch (err) {
    place = (lead.googleRaw as PlaceResult | null) ?? null;
    notes.push(
      `Google details unavailable (${err instanceof Error ? err.message.slice(0, 120) : "error"}) — used cached lead data.`,
    );
  }

  try {
    const site = buildSalonConfig(lead, place, { name: parsed.data.name });
    const written = writeSite(site, lead);
    notes.push(...site.notes);

    const base = process.env.SALON_SITE_BASE_URL ?? "http://localhost:3000";
    const url = `${base.replace(/\/$/, "")}/${written.slug}`;

    const manual = new Set(lead.manualFields ?? []);
    const patch: Record<string, unknown> = {
      demoCreated: true,
      demoAt: lead.demoAt ?? new Date().toISOString(),
    };
    if (!manual.has("demoUrl")) patch.demoUrl = url;
    if (lead.demoStatus === "NONE") patch.demoStatus = "IN_PROGRESS";

    const write = await db().from(TABLES.leads).update(toRow(patch)).eq("id", id);
    if (write.error) return NextResponse.json({ error: write.error.message }, { status: 500 });

    await logActivity(
      id,
      "DEMO",
      `Website generated: /${written.slug}`,
      notes.join("\n") || null,
      { slug: written.slug, url, mediaDir: written.mediaDir },
    );

    return NextResponse.json({ slug: written.slug, url, mediaDir: written.mediaDir, notes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Site generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
