import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Reel downloading and encoding for the generated sites.
 *
 * Instagram links go through yt-dlp — the tool every "reel downloader" site
 * wraps, minus the ads — and direct video links (from any source) are fetched
 * as-is. Either way the clip is re-encoded to the template's reel format:
 * 9:16 center-crop, 720x1280, silent, capped at 30 seconds, ~2MB.
 *
 * Both binaries are resolved lazily: env override first, then PATH, then the
 * WinGet package folders — a dev server started before the tools were
 * installed still finds them without a restart.
 */

function isRunnable(bin: string, probeArg: string): boolean {
  try {
    return spawnSync(bin, [probeArg], { timeout: 15000, windowsHide: true }).status === 0;
  } catch {
    return false;
  }
}

/** Newest matching executable under the WinGet packages dir, if any. */
function wingetFind(pattern: RegExp, exe: string): string[] {
  const root = path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WinGet", "Packages");
  const hits: string[] = [];
  try {
    for (const dir of fs.readdirSync(root)) {
      if (!pattern.test(dir)) continue;
      const stack = [path.join(root, dir)];
      while (stack.length) {
        const cur = stack.pop()!;
        for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
          const full = path.join(cur, entry.name);
          if (entry.isDirectory()) stack.push(full);
          else if (entry.name.toLowerCase() === exe) hits.push(full);
        }
      }
    }
  } catch {
    /* no winget dir - fall through */
  }
  return hits;
}

const resolved = new Map<string, string>();

function resolveTool(
  name: "yt-dlp" | "ffmpeg",
  envVar: string,
  probeArg: string,
  wingetPattern: RegExp,
): string {
  const cached = resolved.get(name);
  if (cached) return cached;

  const candidates = [
    process.env[envVar],
    name,
    ...wingetFind(wingetPattern, `${name}.exe`),
  ].filter((c): c is string => Boolean(c));

  for (const bin of candidates) {
    if (isRunnable(bin, probeArg)) {
      resolved.set(name, bin);
      return bin;
    }
  }
  throw new Error(
    `${name} was not found — install it (winget install ${name === "yt-dlp" ? "yt-dlp.yt-dlp" : "Gyan.FFmpeg"}) or set ${envVar}.`,
  );
}

export const ytDlpBin = () => resolveTool("yt-dlp", "YT_DLP_PATH", "--version", /^yt-dlp\.yt-dlp_/i);
export const ffmpegBin = () => resolveTool("ffmpeg", "FFMPEG_PATH", "-version", /FFmpeg/i);

function run(bin: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += String(d)));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${path.basename(bin)} timed out`));
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(bin)} failed: ${stderr.slice(-400) || `exit ${code}`}`));
    });
  });
}

export function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lead-reel-"));
}

/** Downloads one Instagram post/reel into `tmpDir` and returns the file path. */
export async function downloadInstagramVideo(url: string, tmpDir: string): Promise<string> {
  const template = path.join(tmpDir, "src.%(ext)s");
  await run(
    ytDlpBin(),
    ["-f", "mp4/best", "--no-playlist", "--max-filesize", "300M", "-o", template, url],
    120000,
  );
  const file = fs.readdirSync(tmpDir).find((f) => f.startsWith("src."));
  if (!file) throw new Error("yt-dlp produced no file");
  return path.join(tmpDir, file);
}

const IMAGE_EXT = /\.(jpe?g|png|webp|avif)$/i;

/**
 * The still image behind an Instagram post link.
 *
 * yt-dlp knows how to reach the media of a public post, so its thumbnail is
 * the picture itself for a photo post and the cover frame for a reel. When the
 * extractor refuses — a login wall, a rate limit — the post's own `og:image`
 * meta tag is the fallback, which is what a link preview would show.
 */
export async function fetchInstagramImage(url: string, tmpDir: string): Promise<Buffer> {
  try {
    await run(
      ytDlpBin(),
      [
        "--skip-download",
        "--write-thumbnail",
        "--convert-thumbnails", "jpg",
        "--no-playlist",
        "-o", path.join(tmpDir, "img.%(ext)s"),
        url,
      ],
      90000,
    );
    const file = fs.readdirSync(tmpDir).find((f) => IMAGE_EXT.test(f));
    if (file) return fs.readFileSync(path.join(tmpDir, file));
  } catch {
    /* fall through to the og:image route */
  }

  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      accept: "text/html",
    },
    cache: "no-store",
  });
  const html = res.ok ? await res.text() : "";
  const src =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1];
  if (!src) {
    throw new Error(
      "Instagram would not hand over that image — open the post, right-click the photo, and paste its image address instead.",
    );
  }

  const img = await fetch(src.replace(/&amp;/g, "&"), {
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!img.ok) throw new Error(`Instagram image request failed (HTTP ${img.status})`);
  return Buffer.from(await img.arrayBuffer());
}

/**
 * The template's reel format: 9:16 center-crop at 720x1280, no audio track,
 * first 30 seconds, H.264 with faststart so playback begins immediately.
 */
export async function encodeReel(srcPath: string, outPath: string): Promise<void> {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await run(
    ffmpegBin(),
    [
      "-y",
      "-i", srcPath,
      "-t", "30",
      "-vf", "crop=min(iw\\,ih*9/16):min(ih\\,iw*16/9),scale=720:1280",
      "-an",
      "-c:v", "libx264",
      "-preset", "slow",
      "-crf", "26",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      outPath,
    ],
    180000,
  );
}

export function cleanupTmpDir(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* tmp cleanup is best-effort */
  }
}
