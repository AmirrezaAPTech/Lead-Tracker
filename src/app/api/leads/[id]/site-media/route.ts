import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { db, fromRow, TABLES } from "@/lib/db";
import { logActivity } from "@/lib/sales";
import {
  clearImageCache,
  findLeadSlug,
  isVideoSlot,
  mediaFilePath,
  mediaStatus,
  ALL_SLOTS,
} from "@/lib/site-generator";
import { isInstagramUrl, resolveImageBuffer } from "@/lib/media-source";
import { cleanupTmpDir, downloadInstagramVideo, encodeReel, makeTmpDir } from "@/lib/video";
import type { Lead } from "@/lib/types";

export const maxDuration = 300;

/** 20MB is far above any Google photo; anything bigger is the wrong link. */
const MAX_BYTES = 20 * 1024 * 1024;
/** Direct video links can be heavier before re-encoding shrinks them. */
const MAX_VIDEO_BYTES = 300 * 1024 * 1024;

const bodySchema = z.object({
  url: z.string().url(),
  slot: z.enum(ALL_SLOTS.map((s) => s.id) as [string, ...string[]]),
});

async function leadAndSlug(id: string) {
  const found = await db().from(TABLES.leads).select("*").eq("id", id).maybeSingle();
  if (found.error) throw new Error(found.error.message);
  const lead = fromRow<Lead>(found.data);
  if (!lead) return { lead: null, slug: null };
  return { lead, slug: findLeadSlug(id) };
}

/** The site's live URL plus slot status: which sections already have a real file. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { lead, slug } = await leadAndSlug(id);
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const base = (process.env.SALON_SITE_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
    return NextResponse.json({
      slug,
      url: slug ? `${base}/${slug}` : null,
      slots: slug ? mediaStatus(slug) : [],
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

/**
 * Downloads one pasted photo link (Google Maps photos included — those are
 * re-requested at gallery resolution), converts it to an optimized JPEG and
 * drops it into the slot's exact filename in the lead's site media folder.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide a link and a section" }, { status: 400 });
  }
  const slot = ALL_SLOTS.find((s) => s.id === parsed.data.slot)!;

  try {
    const { lead, slug } = await leadAndSlug(id);
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    if (!slug) {
      return NextResponse.json(
        { error: "No generated website for this lead yet — click Generate website first." },
        { status: 400 },
      );
    }

    if (isVideoSlot(slot.id)) return saveReel(id, slug, slot, parsed.data.url.trim());

    // Direct image, Google Maps share link or Instagram post — one resolver
    // handles all three, so the operator never has to know which is which.
    let buffer: Buffer;
    try {
      buffer = await resolveImageBuffer(parsed.data.url);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Could not read that link" },
        { status: 400 },
      );
    }

    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "Image is larger than 20MB" }, { status: 400 });
    }

    // Whatever arrives (webp, png, HEIC-in-jpg...) leaves as a web-ready JPEG
    // under the exact filename the generated config already points at.
    let out: Buffer;
    let meta: { width?: number; height?: number };
    try {
      const pipeline = sharp(buffer).rotate().resize({
        width: 2000,
        height: 2000,
        fit: "inside",
        withoutEnlargement: true,
      });
      out = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      meta = await sharp(out).metadata();
    } catch {
      return NextResponse.json({ error: "That file is not a readable image" }, { status: 400 });
    }

    const target = mediaFilePath(slug, slot.id);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, out);
    // Replacing a photo reuses its URL, so the old optimized copy has to go.
    clearImageCache();

    await logActivity(id, "OTHER", `Website photo added: ${slot.label}`, null, {
      slot: slot.id,
      file: slot.file,
      kb: Math.round(out.byteLength / 1024),
    });

    return NextResponse.json({
      slot: slot.id,
      file: slot.file,
      kb: Math.round(out.byteLength / 1024),
      width: meta.width ?? null,
      height: meta.height ?? null,
      slots: mediaStatus(slug),
    });
  } catch (err) {
    const message =
      err instanceof Error && err.name === "TimeoutError"
        ? "Image download timed out"
        : err instanceof Error
          ? err.message
          : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type Slot = (typeof ALL_SLOTS)[number];

/**
 * The video path: an Instagram link goes through yt-dlp, anything else is
 * fetched directly (for the clips a downloader site hands out as plain .mp4).
 * Either way ffmpeg re-encodes to the template's reel format before the file
 * lands in `reels/N.mp4`.
 */
async function saveReel(leadId: string, slug: string, slot: Slot, url: string) {
  const tmp = makeTmpDir();
  try {
    let srcPath: string;

    if (isInstagramUrl(url)) {
      try {
        srcPath = await downloadInstagramVideo(url, tmp);
      } catch (err) {
        const detail = err instanceof Error ? err.message.slice(0, 200) : "download failed";
        return NextResponse.json(
          {
            error: `Instagram blocked the download (${detail}). Grab the clip with any reel-downloader site and paste the direct .mp4 link here instead.`,
          },
          { status: 400 },
        );
      }
    } else {
      const res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(60000),
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; LeadCockpit/1.0; media fetch)",
          accept: "video/*,*/*;q=0.5",
        },
        cache: "no-store",
      });
      if (!res.ok) {
        return NextResponse.json({ error: `Video request failed (HTTP ${res.status})` }, { status: 400 });
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("text/html")) {
        return NextResponse.json(
          { error: "That link is a web page, not a video file. Paste an Instagram reel link, or a direct .mp4 link." },
          { status: 400 },
        );
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.byteLength > MAX_VIDEO_BYTES) {
        return NextResponse.json({ error: "Video is larger than 300MB" }, { status: 400 });
      }
      srcPath = path.join(tmp, "src.mp4");
      fs.writeFileSync(srcPath, buffer);
    }

    const target = mediaFilePath(slug, slot.id);
    try {
      await encodeReel(srcPath, target);
    } catch (err) {
      return NextResponse.json(
        { error: `That file could not be encoded as a video (${err instanceof Error ? err.message.slice(0, 160) : "ffmpeg failed"})` },
        { status: 400 },
      );
    }

    const kb = Math.round(fs.statSync(target).size / 1024);
    await logActivity(leadId, "OTHER", `Website reel added: ${slot.label}`, null, {
      slot: slot.id,
      file: slot.file,
      kb,
    });

    return NextResponse.json({
      slot: slot.id,
      file: slot.file,
      kb,
      width: 720,
      height: 1280,
      slots: mediaStatus(slug),
    });
  } finally {
    cleanupTmpDir(tmp);
  }
}
