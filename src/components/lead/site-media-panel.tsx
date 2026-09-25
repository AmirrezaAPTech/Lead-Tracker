"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, ImagePlus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Slot = { id: string; label: string; file: string; exists: boolean };

/**
 * Paste a photo link from the lead's Google Maps listing, pick the section,
 * done — the server downloads it at full resolution, optimizes it and drops it
 * into the generated site's media folder under the exact filename the config
 * expects. Green checks show which sections already have a real photo.
 */
export function SiteMediaPanel({ leadId }: { leadId: string }) {
  const [slug, setSlug] = useState<string | null>(null);
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [url, setUrl] = useState("");
  const [slot, setSlot] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/leads/${leadId}/site-media`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setSlug(data.slug ?? null);
      setSiteUrl(data.url ?? null);
      setSlots(data.slots ?? []);
      if (!data.slots?.some((s: Slot) => s.id === slot)) setSlot(data.slots?.[0]?.id ?? "");
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    if (!url.trim() || !slot) return;
    setBusy(true);
    const res = await fetch(`/api/leads/${leadId}/site-media`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: url.trim(), slot }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Adding the photo failed");
      return;
    }
    toast.success(`Saved to ${data.file} (${data.kb} KB, ${data.width}×${data.height})`);
    setUrl("");
    if (data.slots) setSlots(data.slots);
  }

  if (!loaded) return <p className="text-xs text-muted-foreground">Loading…</p>;

  if (!slug) {
    return (
      <p className="text-xs text-muted-foreground">
        Generate the website first — then photos from their Google Maps listing can be
        dropped straight into its sections.
      </p>
    );
  }

  const filled = slots.filter((s) => s.exists).length;

  return (
    <div className="space-y-2.5">
      {siteUrl && (
        <div className="flex items-center gap-1.5 rounded-md border bg-muted/40 p-2">
          <a
            href={siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 truncate text-xs font-medium underline underline-offset-2"
          >
            {siteUrl}
          </a>
          <Button
            size="xs"
            variant="ghost"
            title="Copy link"
            onClick={() => {
              void navigator.clipboard.writeText(siteUrl);
              toast.success("Link copied");
            }}
          >
            <Copy />
          </Button>
          <Button
            size="xs"
            variant="ghost"
            title="Open website"
            onClick={() => window.open(siteUrl, "_blank", "noopener")}
          >
            <ExternalLink />
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Photos: a Google Maps photo <em>share</em> link works, so does an image address or an
        Instagram post. Reels: an Instagram link (up to a minute) or a direct .mp4.{" "}
        {filled}/{slots.length} sections filled.
      </p>

      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://maps.app.goo.gl/… or https://www.instagram.com/reel/…"
        className="text-xs"
      />

      <div className="flex gap-1.5">
        <select
          value={slot}
          onChange={(e) => setSlot(e.target.value)}
          className="border-input bg-transparent dark:bg-input/30 h-8 w-full min-w-0 flex-1 rounded-md border px-2 text-xs shadow-xs outline-none"
        >
          {slots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.exists ? "✓ " : ""}
              {s.label}
            </option>
          ))}
        </select>

        <Button size="xs" disabled={busy || !url.trim()} onClick={() => void submit()}>
          {busy ? <RefreshCw className="animate-spin" /> : <ImagePlus />} Add
        </Button>
      </div>

      {filled > 0 && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {slots
            .filter((s) => s.exists)
            .map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1">
                <Check className="size-3 text-emerald-600" />
                {s.label}
              </span>
            ))}
        </p>
      )}
    </div>
  );
}
