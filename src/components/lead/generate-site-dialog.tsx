"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Globe, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * The fields the operator fills in before a site is generated: the real brand
 * name (Google Maps titles are keyword-stuffed listings, not brands) and the
 * handful of media slots that actually make a site look like this salon.
 */
const MEDIA_FIELDS = [
  {
    slot: "experience",
    label: "Ritual section photo",
    hint: "Google Maps photo share link, image address, or Instagram post",
  },
  { slot: "about-1", label: "About — main photo", hint: "Maps share link, image address, or Instagram post" },
  { slot: "about-2", label: "About — second photo", hint: "Maps share link, image address, or Instagram post" },
  { slot: "reel-1", label: "Instagram reel 1", hint: "instagram.com/reel/… or a direct .mp4" },
  { slot: "reel-2", label: "Instagram reel 2", hint: "instagram.com/reel/… or a direct .mp4" },
  { slot: "reel-3", label: "Instagram reel 3", hint: "instagram.com/reel/… or a direct .mp4" },
  { slot: "reel-4", label: "Instagram reel 4", hint: "instagram.com/reel/… or a direct .mp4" },
] as const;

type State = "busy" | "done" | "kept" | "error";
/** `uploaded` remembers which link produced the file now sitting in each slot. */
type Draft = { name: string; urls: Record<string, string>; uploaded: Record<string, string> };

/** Runs the queue a few at a time: reels are heavy, and four at once is not kind. */
async function runQueue<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) await fn(items[cursor++]);
    }),
  );
}

export function GenerateSiteDialog({
  leadId,
  leadName,
  hasSite,
}: {
  leadId: string;
  leadName: string;
  hasSite: boolean;
}) {
  const router = useRouter();
  const storageKey = `generate-site:${leadId}`;

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [uploaded, setUploaded] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, { state: State; error?: string }>>({});
  const [onFile, setOnFile] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<"form" | "running" | "finished">("form");
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  /*
   * The draft survives closing the dialog — four pasted reel links are minutes
   * of work, and a stray click outside the panel should not cost them. Reading
   * happens after mount rather than in the initial state so the server-rendered
   * markup and the first client render still agree.
   */
  useEffect(() => {
    let saved: Partial<Draft> | null = null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) saved = JSON.parse(raw) as Partial<Draft>;
    } catch {
      /* private mode, or a draft written by an older version */
    }
    setName(saved?.name ?? leadName);
    setUrls(saved?.urls ?? {});
    setUploaded(saved?.uploaded ?? {});
    setRestored(true);
  }, [storageKey, leadName]);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ name, urls, uploaded } satisfies Draft),
      );
    } catch {
      /* nothing to do: the draft is a convenience, not the record */
    }
  }, [restored, storageKey, name, urls, uploaded]);

  // What is already on disk, so a reopened draft does not re-upload work that
  // is done — a reel costs a minute to fetch and encode.
  useEffect(() => {
    if (!open) return;
    void (async () => {
      const res = await fetch(`/api/leads/${leadId}/site-media`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.slots)) return;
      setOnFile(
        new Set(
          (data.slots as { id: string; exists: boolean }[])
            .filter((s) => s.exists)
            .map((s) => s.id),
        ),
      );
      if (data.url) setSiteUrl(data.url as string);
    })();
  }, [open, leadId]);

  async function run() {
    setPhase("running");
    setStatus({});

    // 1. The site itself — fast, and everything else depends on its slug.
    const res = await fetch(`/api/leads/${leadId}/generate-site`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(name.trim() ? { name: name.trim() } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Website generation failed");
      setPhase("form");
      return;
    }

    setSiteUrl(data.url ?? null);
    for (const note of (data.notes as string[] | undefined) ?? []) {
      toast.info(note, { duration: 9000 });
    }

    // 2. Then the media. A link that already produced the file in its slot is
    // left alone — regenerating after a name fix must not re-download four
    // reels that are sitting on disk, correct, from the last run.
    const filled = MEDIA_FIELDS.filter((f) => urls[f.slot]?.trim());
    const kept = filled.filter(
      (f) => onFile.has(f.slot) && uploaded[f.slot] === urls[f.slot].trim(),
    );
    const pending = filled.filter((f) => !kept.includes(f));

    setStatus({
      ...Object.fromEntries(kept.map((f) => [f.slot, { state: "kept" as State }])),
      ...Object.fromEntries(pending.map((f) => [f.slot, { state: "busy" as State }])),
    });

    await runQueue(pending, 3, async (field) => {
      const link = urls[field.slot].trim();
      const upload = await fetch(`/api/leads/${leadId}/site-media`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: link, slot: field.slot }),
      });
      const result = await upload.json().catch(() => ({}));
      if (upload.ok) {
        setOnFile((s) => new Set(s).add(field.slot));
        setUploaded((u) => ({ ...u, [field.slot]: link }));
      }
      setStatus((s) => ({
        ...s,
        [field.slot]: upload.ok
          ? { state: "done" }
          : { state: "error", error: result.error ?? "Failed" },
      }));
    });

    setPhase("finished");
    router.refresh();
  }

  function clearDraft() {
    setName(leadName);
    setUrls({});
    setUploaded({});
    setStatus({});
    toast.success("Draft cleared");
  }

  const failed = Object.values(status).filter((s) => s.state === "error").length;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Only the run's transient state is dropped; the typed draft stays.
        if (!next) {
          setPhase("form");
          setStatus({});
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="xs" variant="outline">
          <Globe /> {hasSite ? "Regenerate website" : "Generate website"}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate website</DialogTitle>
          <DialogDescription>
            Media is optional — every empty slot keeps its house default and can be filled later
            from the Website media panel. What you type here is kept until you clear it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="brand-name" className="text-xs">
              Business name
            </Label>
            <Input
              id="brand-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={leadName}
              disabled={phase !== "form"}
              className="text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Google Maps titles carry keywords (“… Women &amp; Men Beauty Saloon”). Trim it down
              to the real brand name — this also sets the site&apos;s address.
            </p>
          </div>

          {MEDIA_FIELDS.map((field) => {
            const st = status[field.slot]?.state;
            return (
              <div key={field.slot} className="space-y-1">
                <Label htmlFor={field.slot} className="flex items-center gap-1.5 text-xs">
                  {field.label}
                  {st === "busy" && <RefreshCw className="size-3 animate-spin text-muted-foreground" />}
                  {st === "done" && <Check className="size-3 text-emerald-600" />}
                  {st === "error" && <X className="size-3 text-destructive" />}
                  {st === "kept" && (
                    <span className="flex items-center gap-1 text-[10px] font-normal text-muted-foreground">
                      <Check className="size-3" /> kept — unchanged
                    </span>
                  )}
                  {!st && onFile.has(field.slot) && (
                    <span className="text-[10px] font-normal text-muted-foreground">
                      — already on the site
                    </span>
                  )}
                </Label>
                <Input
                  id={field.slot}
                  value={urls[field.slot] ?? ""}
                  onChange={(e) => setUrls((u) => ({ ...u, [field.slot]: e.target.value }))}
                  placeholder={field.hint}
                  disabled={phase !== "form"}
                  className="text-xs"
                />
                {status[field.slot]?.error && (
                  <p className="text-[11px] text-destructive">{status[field.slot].error}</p>
                )}
              </div>
            );
          })}
        </div>

        {siteUrl && (
          <div className="rounded-md border bg-muted/40 p-2.5">
            <p className="text-[11px] text-muted-foreground">Website</p>
            <a
              href={siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-xs font-medium underline underline-offset-2"
            >
              {siteUrl}
            </a>
          </div>
        )}

        <DialogFooter>
          {phase === "finished" ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (siteUrl) void navigator.clipboard.writeText(siteUrl);
                  toast.success("Link copied");
                }}
              >
                <Copy /> Copy link
              </Button>
              <Button size="sm" onClick={() => siteUrl && window.open(siteUrl, "_blank", "noopener")}>
                <ExternalLink /> Open website
              </Button>
              <DialogClose asChild>
                <Button size="sm" variant="ghost">
                  {failed ? `Close (${failed} failed)` : "Done"}
                </Button>
              </DialogClose>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={phase === "running"}
                onClick={clearDraft}
              >
                Clear
              </Button>
              <Button size="sm" disabled={phase === "running"} onClick={() => void run()}>
                {phase === "running" ? <RefreshCw className="animate-spin" /> : <Globe />}
                {phase === "running" ? "Building…" : "Generate"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
