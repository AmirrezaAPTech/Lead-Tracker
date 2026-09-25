import { NextResponse } from "next/server";
import { db, fromRow, toRow, TABLES } from "@/lib/db";
import { placeDetails, PlacesError } from "@/lib/places";
import { fillMissing, placeToLeadData } from "@/lib/place-mapper";
import { rescoreLead } from "@/lib/scoring";
import { logActivity } from "@/lib/sales";
import type { Lead } from "@/lib/types";

/**
 * Place Details - the expensive call. Explicit, one lead at a time,
 * blocked for rejected leads and cached for 30 days.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await db().from(TABLES.leads).select("*").eq("id", id).maybeSingle();
  if (found.error) return NextResponse.json({ error: found.error.message }, { status: 500 });

  const lead = fromRow<Lead>(found.data);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  if (lead.status === "REJECTED") {
    return NextResponse.json({ error: "Rejected leads are not enriched (saves API cost)" }, { status: 400 });
  }

  const cachedFor = lead.detailsFetchedAt ? Date.now() - new Date(lead.detailsFetchedAt).getTime() : Infinity;
  if (cachedFor < 30 * 24 * 3600 * 1000) {
    return NextResponse.json({ lead, cached: true });
  }

  try {
    const place = await placeDetails(lead.placeId);
    const mapped = placeToLeadData(place, lead.city);
    const manual = new Set(lead.manualFields ?? []);
    const patch = fillMissing(
      lead as unknown as Record<string, unknown>,
      {
        phone: mapped.phone,
        website: mapped.website,
        address: mapped.address,
        neighborhood: mapped.neighborhood,
        district: mapped.district,
        category: mapped.category,
        mapsUrl: mapped.mapsUrl,
      },
      lead.manualFields ?? [],
    );

    // Google numbers are refreshed - they are the ones that move - unless the
    // operator has corrected them by hand.
    if (!manual.has("rating")) patch.rating = mapped.rating ?? lead.rating;
    if (!manual.has("reviewCount")) patch.reviewCount = mapped.reviewCount ?? lead.reviewCount;
    if (!manual.has("businessStatus")) patch.businessStatus = mapped.businessStatus ?? lead.businessStatus;
    if (!manual.has("priceLevel")) patch.priceLevel = place.priceLevel ?? lead.priceLevel;
    patch.googleRaw = mapped.googleRaw;
    patch.detailsFetchedAt = new Date().toISOString();
    patch.googleFetchedAt = new Date().toISOString();
    if (patch.website) patch.hasWebsite = true;

    const write = await db().from(TABLES.leads).update(toRow(patch)).eq("id", id);
    if (write.error) return NextResponse.json({ error: write.error.message }, { status: 500 });

    await logActivity(id, "ENRICHED", "Enriched from Google Place Details");
    const updated = await rescoreLead(id);
    return NextResponse.json({ lead: updated, cached: false });
  } catch (err) {
    const status = err instanceof PlacesError ? err.status : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Enrich failed" }, { status });
  }
}
