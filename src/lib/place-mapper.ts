import type { PlaceResult } from "./places";
import type { LeadWrite } from "./types";

const NEIGHBORHOOD_TYPES = ["neighborhood", "sublocality_level_1", "sublocality", "administrative_area_level_4"];
const DISTRICT_TYPES = ["administrative_area_level_2", "locality"];
const CITY_TYPES = ["administrative_area_level_1"];

function pickComponent(place: PlaceResult, types: string[]) {
  const comps = place.addressComponents ?? [];
  for (const t of types) {
    const hit = comps.find((c) => (c.types ?? []).includes(t));
    if (hit?.longText) return cleanArea(hit.longText);
  }
  return undefined;
}

/** "Tesvikiye Mahallesi" -> "Tesvikiye", "Sisli/Istanbul" -> "Sisli" */
function cleanArea(s: string) {
  return s
    .replace(/\s*(mahallesi|mah\.?|mahalle)\s*$/i, "")
    .split("/")[0]
    .trim();
}

/**
 * Fallback parser for Turkish formatted addresses when addressComponents is absent.
 * Example: "Tesvikiye, Sakayik Sk. No:40, 34365 Sisli/Istanbul, Turkiye"
 */
function parseTurkishAddress(address?: string) {
  if (!address) return {};
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  let district: string | undefined;
  let city: string | undefined;

  const withSlash = parts.find((p) => p.includes("/"));
  if (withSlash) {
    const [d, c] = withSlash.split("/");
    district = cleanArea(d.replace(/^\d{4,6}\s*/, ""));
    city = c?.trim();
  }

  const first = parts[0];
  const neighborhood =
    first && !/\d/.test(first) && !/(sok|sk\.|cad|cd\.|bulv|blv)/i.test(first) ? cleanArea(first) : undefined;

  return { neighborhood, district, city };
}

export function extractInstagramUsername(url?: string | null) {
  if (!url) return undefined;
  const m = url.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  const handle = m?.[1];
  if (!handle || ["p", "reel", "explore", "stories"].includes(handle.toLowerCase())) return undefined;
  return handle;
}

/** Maps a Places API result onto lead columns. */
export function placeToLeadData(place: PlaceResult, defaultCity = "Istanbul"): LeadWrite & { placeId: string; name: string } {
  const fallback = parseTurkishAddress(place.formattedAddress);
  const neighborhood = pickComponent(place, NEIGHBORHOOD_TYPES) ?? fallback.neighborhood ?? null;
  const district = pickComponent(place, DISTRICT_TYPES) ?? fallback.district ?? null;
  const city = pickComponent(place, CITY_TYPES) ?? fallback.city ?? defaultCity;
  const website = place.websiteUri ?? null;

  return {
    placeId: place.id,
    name: place.displayName?.text ?? "(unnamed)",
    category: place.primaryTypeDisplayName?.text ?? place.primaryType ?? null,
    primaryType: place.primaryType ?? null,
    types: place.types ?? [],
    address: place.formattedAddress ?? null,
    shortAddress: place.shortFormattedAddress ?? null,
    neighborhood,
    district,
    city,
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
    mapsUrl: place.googleMapsUri ?? `https://www.google.com/maps/place/?q=place_id:${place.id}`,
    phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? null,
    businessStatus: place.businessStatus ?? null,
    rating: place.rating ?? null,
    reviewCount: place.userRatingCount ?? null,
    hasWebsite: Boolean(website),
    website,
    googleFetchedAt: new Date().toISOString(),
    googleRaw: place as unknown,
  };
}

/**
 * Only fills columns that are still empty, and never touches a column the
 * operator has edited by hand (see leads.manual_fields).
 */
export function fillMissing(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
  manualFields: string[] = [],
) {
  const manual = new Set(manualFields);
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (manual.has(k)) continue;
    const current = existing[k];
    const isEmpty =
      current === null || current === undefined || current === "" || (Array.isArray(current) && current.length === 0);
    if (isEmpty) patch[k] = v;
  }
  return patch;
}
