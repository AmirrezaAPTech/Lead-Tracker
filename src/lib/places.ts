/**
 * Google Places API (New) client.
 * Official API only - no Maps HTML scraping.
 *
 * Cost control (see README): the field mask decides the billing SKU.
 *  - BASIC = "Pro" fields only (name, address, types, maps url, business status)
 *  - FULL  = Pro + the "Enterprise" fields we actually need for scoring/outreach
 *            (rating, review count, phone, website)
 * Place Details is only ever called explicitly, per lead, from the Enrich action.
 */

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const DETAILS_URL = "https://places.googleapis.com/v1/places";

export type FieldTier = "BASIC" | "FULL";

const PRO_FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.shortFormattedAddress",
  "places.addressComponents",
  "places.location",
  "places.types",
  "places.primaryType",
  "places.primaryTypeDisplayName",
  "places.businessStatus",
  "places.googleMapsUri",
];

const ENTERPRISE_FIELDS = [
  "places.rating",
  "places.userRatingCount",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
];

export function fieldMask(tier: FieldTier) {
  const fields = tier === "FULL" ? [...PRO_FIELDS, ...ENTERPRISE_FIELDS] : PRO_FIELDS;
  return [...fields, "nextPageToken"].join(",");
}

export type PlaceOpeningHours = {
  periods?: {
    open?: { day?: number; hour?: number; minute?: number };
    close?: { day?: number; hour?: number; minute?: number };
  }[];
  weekdayDescriptions?: string[];
};

export type PlaceReview = {
  rating?: number;
  text?: { text?: string };
  originalText?: { text?: string };
  authorAttribution?: { displayName?: string; photoUri?: string };
  publishTime?: string;
};

export type PlaceResult = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  addressComponents?: { longText?: string; shortText?: string; types?: string[] }[];
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  businessStatus?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  regularOpeningHours?: PlaceOpeningHours;
  reviews?: PlaceReview[];
};

export type SearchParams = {
  query: string;
  city?: string;
  neighborhood?: string;
  minRating?: number;
  fieldTier?: FieldTier;
  maxPages?: number;
  languageCode?: string;
  regionCode?: string;
};

export function buildTextQuery(p: Pick<SearchParams, "query" | "city" | "neighborhood">) {
  return [p.query, p.neighborhood, p.city].filter((x) => x && String(x).trim()).join(" ").trim();
}

export class PlacesError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

function apiKey() {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new PlacesError("GOOGLE_PLACES_API_KEY is not set", 500);
  return key;
}

/**
 * Text Search. Returns up to 20 results per page; maxPages caps how many
 * paginated requests we are willing to pay for (Google allows 3 pages max).
 */
export async function searchText(params: SearchParams): Promise<{ places: PlaceResult[]; apiCalls: number }> {
  const tier = params.fieldTier ?? "FULL";
  const maxPages = Math.min(Math.max(params.maxPages ?? 1, 1), 3);
  const textQuery = buildTextQuery(params);
  if (!textQuery) throw new PlacesError("Empty search query", 400);

  const places: PlaceResult[] = [];
  let pageToken: string | undefined;
  let apiCalls = 0;

  for (let page = 0; page < maxPages; page++) {
    const body: Record<string, unknown> = {
      textQuery,
      languageCode: params.languageCode ?? "tr",
      regionCode: params.regionCode ?? "TR",
      pageSize: 20,
    };
    if (params.minRating && params.minRating > 0) body.minRating = params.minRating;
    if (pageToken) body.pageToken = pageToken;

    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": apiKey(),
        "X-Goog-FieldMask": fieldMask(tier),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    apiCalls++;

    if (!res.ok) {
      const text = await res.text();
      throw new PlacesError(`Google Places search failed (${res.status}): ${text.slice(0, 400)}`, res.status);
    }

    const json = (await res.json()) as { places?: PlaceResult[]; nextPageToken?: string };
    places.push(...(json.places ?? []));
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }

  return { places, apiCalls };
}

const DETAILS_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "addressComponents",
  "location",
  "types",
  "primaryType",
  "primaryTypeDisplayName",
  "businessStatus",
  "googleMapsUri",
  "rating",
  "userRatingCount",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "regularOpeningHours",
  "priceLevel",
].join(",");

/** Place Details - only called on demand (Enrich button), never in bulk. */
export async function placeDetails(placeId: string): Promise<PlaceResult & { priceLevel?: string }> {
  const res = await fetch(`${DETAILS_URL}/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": apiKey(),
      "X-Goog-FieldMask": DETAILS_FIELDS,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new PlacesError(`Google Place details failed (${res.status}): ${text.slice(0, 400)}`, res.status);
  }
  return res.json();
}

/**
 * The fields website generation needs and nothing else: real opening hours and
 * real reviews (with author names and photos) for the generated site. Requested
 * in Turkish so review text arrives untranslated. One call per generated site.
 */
const SITE_DETAILS_FIELDS = [
  "id",
  "rating",
  "userRatingCount",
  "regularOpeningHours",
  "reviews",
  "googleMapsUri",
].join(",");

export async function placeDetailsForSite(placeId: string): Promise<PlaceResult> {
  const res = await fetch(`${DETAILS_URL}/${encodeURIComponent(placeId)}?languageCode=tr`, {
    headers: {
      "X-Goog-Api-Key": apiKey(),
      "X-Goog-FieldMask": SITE_DETAILS_FIELDS,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new PlacesError(`Google Place details failed (${res.status}): ${text.slice(0, 400)}`, res.status);
  }
  return res.json();
}
