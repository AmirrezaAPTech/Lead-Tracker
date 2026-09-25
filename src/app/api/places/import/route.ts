import { NextResponse } from "next/server";
import { z } from "zod";
import { db, toRow, TABLES } from "@/lib/db";
import { importPlaces } from "@/lib/import";
import { PlacesError, searchText } from "@/lib/places";

export const maxDuration = 300;

const Body = z.object({
  queries: z.array(z.string().min(1)).min(1).max(12),
  campaignId: z.string().uuid().nullish(),
  city: z.string().default("Istanbul"),
  neighborhood: z.string().optional(),
  minRating: z.number().min(0).max(5).optional(),
  minReviews: z.number().min(0).optional(),
  fieldTier: z.enum(["BASIC", "FULL"]).default("FULL"),
  maxPages: z.number().min(1).max(3).default(1),
  skipClosed: z.boolean().default(true),
});

/** Runs each query, imports the results and records one search run per query. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const input = parsed.data;

  const runs: Record<string, unknown>[] = [];
  let created = 0;
  let duplicates = 0;
  let skipped = 0;
  let apiCalls = 0;

  for (const query of input.queries) {
    const runRes = await db()
      .from(TABLES.searchRuns)
      .insert(
        toRow({
          campaignId: input.campaignId ?? null,
          query,
          city: input.city,
          neighborhood: input.neighborhood ?? null,
          minRating: input.minRating ?? null,
          minReviews: input.minReviews ?? null,
          fieldTier: input.fieldTier,
        }),
      )
      .select("id")
      .single();
    if (runRes.error) return NextResponse.json({ error: runRes.error.message }, { status: 500 });
    const runId = (runRes.data as { id: string }).id;

    try {
      const { places, apiCalls: calls } = await searchText({
        query,
        city: input.city,
        neighborhood: input.neighborhood,
        minRating: input.minRating,
        fieldTier: input.fieldTier,
        maxPages: input.maxPages,
      });

      const summary = await importPlaces(places, {
        campaignId: input.campaignId ?? null,
        searchRunId: runId,
        query,
        city: input.city,
        minReviews: input.minReviews ?? null,
        minRating: input.minRating ?? null,
        skipClosed: input.skipClosed,
      });

      await db()
        .from(TABLES.searchRuns)
        .update(
          toRow({
            resultCount: summary.total,
            newCount: summary.created,
            dupeCount: summary.duplicates,
            skippedCount: summary.skipped,
            apiCalls: calls,
          }),
        )
        .eq("id", runId);

      created += summary.created;
      duplicates += summary.duplicates;
      skipped += summary.skipped;
      apiCalls += calls;
      runs.push({ query, ...summary, apiCalls: calls });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Search failed";
      await db().from(TABLES.searchRuns).update({ error: message }).eq("id", runId);
      runs.push({ query, error: message });
      if (err instanceof PlacesError && err.status === 403) break;
    }
  }

  return NextResponse.json({ created, duplicates, skipped, apiCalls, runs });
}
