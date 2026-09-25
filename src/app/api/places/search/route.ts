import { NextResponse } from "next/server";
import { z } from "zod";
import { db, TABLES } from "@/lib/db";
import { PlacesError, searchText } from "@/lib/places";

export const maxDuration = 60;

const Body = z.object({
  query: z.string().min(1),
  city: z.string().optional(),
  neighborhood: z.string().optional(),
  minRating: z.number().min(0).max(5).optional(),
  minReviews: z.number().min(0).optional(),
  fieldTier: z.enum(["BASIC", "FULL"]).default("FULL"),
  maxPages: z.number().min(1).max(3).default(1),
});

/** Preview a search without writing anything. Shows which results already exist. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const input = parsed.data;

  try {
    const { places, apiCalls } = await searchText(input);
    const ids = places.map((p) => p.id).filter(Boolean);
    const known = await db().from(TABLES.leads).select("id, place_id, status").in("place_id", ids);
    if (known.error) throw new Error(known.error.message);
    const knownMap = new Map(
      (known.data ?? []).map((k) => {
        const row = k as { id: string; place_id: string; status: string };
        return [row.place_id, { id: row.id, status: row.status }];
      }),
    );

    const results = places.map((p) => ({
      placeId: p.id,
      name: p.displayName?.text ?? "(unnamed)",
      address: p.formattedAddress ?? p.shortFormattedAddress ?? null,
      rating: p.rating ?? null,
      reviewCount: p.userRatingCount ?? null,
      website: p.websiteUri ?? null,
      phone: p.nationalPhoneNumber ?? null,
      businessStatus: p.businessStatus ?? null,
      mapsUrl: p.googleMapsUri ?? null,
      existing: knownMap.get(p.id) ?? null,
      belowMinReviews: Boolean(input.minReviews && (p.userRatingCount ?? 0) < input.minReviews),
    }));

    return NextResponse.json({
      apiCalls,
      total: results.length,
      newCount: results.filter((r) => !r.existing && !r.belowMinReviews).length,
      duplicates: results.filter((r) => r.existing).length,
      results,
    });
  } catch (err) {
    const status = err instanceof PlacesError ? err.status : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Search failed" }, { status });
  }
}
