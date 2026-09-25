import { db, fromRow, toRow, TABLES, unwrap } from "./db";
import { placeToLeadData, fillMissing, extractInstagramUsername } from "./place-mapper";
import type { PlaceResult } from "./places";
import { computeScore, getScoringConfig } from "./scoring";
import type { Lead } from "./types";

export type ImportOptions = {
  campaignId?: string | null;
  searchRunId?: string | null;
  query: string;
  city?: string;
  minReviews?: number | null;
  minRating?: number | null;
  skipClosed?: boolean;
};

export type ImportSummary = {
  total: number;
  created: number;
  duplicates: number;
  skipped: number;
  createdIds: string[];
};

/**
 * Idempotent import. Google Place ID is unique, so re-running the same search
 * never creates a second lead - it records the new source and backfills columns
 * that are still empty.
 */
export async function importPlaces(places: PlaceResult[], opts: ImportOptions): Promise<ImportSummary> {
  const cfg = await getScoringConfig();
  const summary: ImportSummary = { total: places.length, created: 0, duplicates: 0, skipped: 0, createdIds: [] };

  for (const place of places) {
    if (!place.id) {
      summary.skipped++;
      continue;
    }
    if ((opts.skipClosed ?? true) && place.businessStatus && place.businessStatus !== "OPERATIONAL") {
      summary.skipped++;
      continue;
    }
    if (opts.minReviews && (place.userRatingCount ?? 0) < opts.minReviews) {
      summary.skipped++;
      continue;
    }
    if (opts.minRating && (place.rating ?? 0) < opts.minRating) {
      summary.skipped++;
      continue;
    }

    const data = placeToLeadData(place, opts.city ?? "Istanbul");

    const found = await db().from(TABLES.leads).select("*").eq("place_id", place.id).maybeSingle();
    if (found.error) throw new Error(`lookup place: ${found.error.message}`);
    const existing = fromRow<Lead>(found.data);

    if (existing) {
      summary.duplicates++;
      // Cheap backfill only: this data was already paid for by the search request.
      const patch = fillMissing(
        existing as unknown as Record<string, unknown>,
        {
          category: data.category,
          primaryType: data.primaryType,
          address: data.address,
          shortAddress: data.shortAddress,
          neighborhood: data.neighborhood,
          district: data.district,
          lat: data.lat,
          lng: data.lng,
          mapsUrl: data.mapsUrl,
          phone: data.phone,
          rating: data.rating,
          reviewCount: data.reviewCount,
          website: data.website,
          businessStatus: data.businessStatus,
        },
        existing.manualFields ?? [],
      );
      if (patch.website && !existing.website) patch.hasWebsite = true;

      if (Object.keys(patch).length) {
        const write = await db().from(TABLES.leads).update(toRow(patch)).eq("id", existing.id);
        if (write.error) throw new Error(`backfill lead: ${write.error.message}`);
      }
      await recordSource(existing.id, opts);
      continue;
    }

    const scored = computeScore(
      {
        hasWebsite: Boolean(data.website),
          website: data.website ?? null,
        websiteIssues: [],
        websiteScore: null,
        instagramUrl: null,
        instagramActive: null,
        instagramFollowers: null,
          reviewCount: data.reviewCount ?? null,
          rating: data.rating ?? null,
          neighborhood: data.neighborhood ?? null,
          district: data.district ?? null,
          address: data.address ?? null,
        types: data.types ?? [],
          primaryType: data.primaryType ?? null,
          category: data.category ?? null,
      },
      cfg,
    );

    const inserted = await db()
      .from(TABLES.leads)
      .insert(
        toRow({
          ...data,
          score: scored.score,
          tier: scored.tier,
          scoreReasons: scored.reasons,
          scoredAt: new Date().toISOString(),
          status: "NEW",
          instagramUsername: extractInstagramUsername(data.website) ?? null,
        }),
      )
      .select("id")
      .single();

    const lead = unwrap(inserted, "insert lead") as { id: string };

    await db()
      .from(TABLES.activities)
      .insert(
        toRow({
          leadId: lead.id,
          type: "IMPORTED",
          title: "Imported from Google Places",
          body: `Query: ${opts.query}`,
          meta: { query: opts.query, campaignId: opts.campaignId ?? null },
        }),
      );

    await recordSource(lead.id, opts);
    summary.created++;
    summary.createdIds.push(lead.id);
  }

  return summary;
}

async function recordSource(leadId: string, opts: ImportOptions) {
  const campaignId = opts.campaignId ?? null;

  let lookup = db().from(TABLES.leadSources).select("id, search_run_id").eq("lead_id", leadId).eq("query", opts.query);
  lookup = campaignId ? lookup.eq("campaign_id", campaignId) : lookup.is("campaign_id", null);

  const found = await lookup.maybeSingle();
  if (found.error) throw new Error(`lookup lead source: ${found.error.message}`);

  if (found.data) {
    const row = found.data as { id: string; search_run_id: string | null };
    if (opts.searchRunId && !row.search_run_id) {
      await db().from(TABLES.leadSources).update({ search_run_id: opts.searchRunId }).eq("id", row.id);
    }
    return;
  }

  const write = await db()
    .from(TABLES.leadSources)
    .insert(toRow({ leadId, campaignId, searchRunId: opts.searchRunId ?? null, query: opts.query }));
  if (write.error) throw new Error(`insert lead source: ${write.error.message}`);
}
