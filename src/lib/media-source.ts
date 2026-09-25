import { upsizeGooglePhotoUrl } from "./site-generator";
import { cleanupTmpDir, fetchInstagramImage, makeTmpDir } from "./video";

/**
 * Turns whatever link the operator pasted into image bytes.
 *
 * Three shapes arrive in practice and all of them are worth accepting, because
 * the alternative is teaching a sales workflow which one Google considers the
 * "real" image address:
 *
 *  - a direct file (`lh3.googleusercontent.com/…`, or any image URL)
 *  - a Google Maps share link (`maps.app.goo.gl/…`) — the page carries the
 *    exact photo that was shared in its `og:image`, so a share link is as good
 *    as a right-click
 *  - an Instagram post link, resolved the same way the reel downloader works
 */

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

/*
 * Pages are asked for their link preview, not for their app.
 *
 * Google Maps answers a browser with the interactive page, whose `og:image` is
 * a rendering of the *map*; it answers a link-preview crawler with the photo
 * that was actually shared. Since a preview image is exactly what is wanted
 * here, the request has to look like the thing that asks for previews. Nothing
 * private is reached this way — it is the same public page, and it is what
 * every chat app pasting the link receives.
 */
const PREVIEW_UA =
  "Mozilla/5.0 (compatible; facebookexternalhit/1.1; +http://www.facebook.com/externalhit_uatext.php)";

function hostOf(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function isInstagramUrl(raw: string): boolean {
  return hostOf(raw).endsWith("instagram.com");
}

export function isGoogleMapsUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const host = hostOf(raw);
    if (host === "maps.app.goo.gl") return true;
    if (host.startsWith("maps.google.")) return true;
    if (host === "goo.gl" || /^google\.[a-z.]+$/.test(host)) {
      return url.pathname.startsWith("/maps");
    }
    return false;
  } catch {
    return false;
  }
}

/** The hosts Google serves real photographs from, as opposed to map tiles. */
const PHOTO_HOST = /(googleusercontent\.com|ggpht\.com)/i;

/**
 * The photo hidden inside a Google Maps URL.
 *
 * Opening a specific photo on maps.google.com puts that photo's own CDN
 * address into the `data=` segment, URL-encoded, as the `!6s…` token — which
 * is where the reel-downloader sites read it from too. Preferring it matters:
 * the page's own preview image for such a URL is the *map*, not the picture
 * being looked at, and the size suffix on the embedded address is a thumbnail
 * that `upsizeGooglePhotoUrl` trades back for the full-resolution original.
 */
export function photoInsideMapsUrl(raw: string): string | null {
  let decoded = raw;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }

  // `!` separates the tokens of the data segment, so it also ends the address.
  const match = decoded.match(/https?:\/\/lh\d+\.googleusercontent\.com\/[^!&\s"'<>]+/i);
  return match?.[0] ?? null;
}

/** `og:image` from a page, with either attribute order. */
function ogImage(html: string): string | null {
  const src =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1] ??
    html.match(/<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+itemprop=["']image["']/i)?.[1];
  return src ? src.replace(/&amp;/g, "&") : null;
}

async function fetchBytes(url: string, accept: string): Promise<Response> {
  return fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(25000),
    headers: { "user-agent": BROWSER_UA, accept },
    cache: "no-store",
  });
}

/** Follows a page link to the picture it previews. */
async function imageBehindPage(url: string): Promise<string | null> {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(25000),
    headers: { "user-agent": PREVIEW_UA, accept: "text/html" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return ogImage(await res.text());
}

export async function resolveImageBuffer(raw: string): Promise<Buffer> {
  const url = raw.trim();

  if (isInstagramUrl(url)) {
    const tmp = makeTmpDir();
    try {
      return await fetchInstagramImage(url, tmp);
    } finally {
      cleanupTmpDir(tmp);
    }
  }

  if (isGoogleMapsUrl(url)) {
    // The address carried in the link beats the page's preview image, which
    // for a place URL is a picture of the map rather than of the salon.
    const embedded = photoInsideMapsUrl(url);
    if (embedded) return download(upsizeGooglePhotoUrl(embedded));

    const found = await imageBehindPage(url);
    if (!found || !PHOTO_HOST.test(found)) {
      throw new Error(
        "That Google Maps link points at the place, not at one of its photos. Open the photo first, then copy the link (or use Share on the photo).",
      );
    }
    return download(upsizeGooglePhotoUrl(found));
  }

  const res = await fetchBytes(upsizeGooglePhotoUrl(url), "image/*,*/*;q=0.5");
  if (!res.ok) throw new Error(`Image request failed (HTTP ${res.status})`);

  // A page rather than a file: its preview image is the best guess, and for
  // most sites that is exactly the picture the operator was looking at.
  if ((res.headers.get("content-type") ?? "").includes("text/html")) {
    const found = ogImage(await res.text());
    if (!found) {
      throw new Error(
        "That link is a web page, not an image. Right-click the photo and use “Copy image address”.",
      );
    }
    return download(upsizeGooglePhotoUrl(found));
  }

  return Buffer.from(await res.arrayBuffer());
}

async function download(url: string): Promise<Buffer> {
  const res = await fetchBytes(url, "image/*,*/*;q=0.5");
  if (!res.ok) throw new Error(`Image request failed (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
