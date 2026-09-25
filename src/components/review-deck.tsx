"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { LeadStatus, LeadTier, RejectReason } from "@/lib/types";
import { Check, X, ChevronRight, ChevronLeft, RotateCcw, Gauge, ExternalLink, Star, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { QuickActions } from "@/components/quick-actions";
import { ScoreReasons, TierBadge, WebsiteChip } from "@/components/bits";
import { REJECT_REASONS } from "@/lib/constants";
import { QuickAdd } from "@/components/lead/quick-add";
import { cn, ensureUrl, telHref } from "@/lib/utils";

export type ReviewLead = {
  id: string;
  name: string;
  category: string | null;
  neighborhood: string | null;
  district: string | null;
  city: string;
  address: string | null;
  rating: number | null;
  reviewCount: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  hasWebsite: boolean;
  websiteScore: number | null;
  websiteIssues: string[];
  websiteCheckedAt: string | null;
  mapsUrl: string | null;
  instagramUrl: string | null;
  instagramUsername: string | null;
  instagramFollowers: number | null;
  instagramActive: boolean | null;
  businessStatus: string | null;
  score: number;
  tier: LeadTier;
  scoreReasons: unknown;
  status: LeadStatus;
  createdAt: string;
};

type Decision = { leadId: string; action: "keep" | "reject" };

export function ReviewDeck({ leads: initial, remaining }: { leads: ReviewLead[]; remaining: number }) {
  const router = useRouter();
  const [leads, setLeads] = useState(initial);
  const [idx, setIdx] = useState(0);
  const [rejecting, setRejecting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Decision[]>([]);
  const [done, setDone] = useState(0);

  const lead = leads[idx];
  const upcoming = useMemo(() => leads.slice(idx + 1, idx + 12), [leads, idx]);

  const openIn = useCallback((url?: string | null) => {
    if (!url) {
      toast.error("Not available for this lead");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const advance = useCallback(() => {
    setRejecting(false);
    setAdding(false);
    setIdx((i) => Math.min(i + 1, leads.length));
  }, [leads.length]);

  const decide = useCallback(
    async (action: "keep" | "reject", reason?: RejectReason) => {
      if (!lead || busy) return;
      setBusy(true);
      const target = lead;
      advance();
      setDone((d) => d + 1);
      setHistory((h) => [...h, { leadId: target.id, action }]);

      const res = await fetch(`/api/leads/${target.id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      setBusy(false);

      if (!res.ok) {
        toast.error(`Could not save ${action} for ${target.name}`);
        return;
      }
      toast.success(action === "keep" ? `Kept ${target.name}` : `Rejected ${target.name}`, { duration: 1200 });
    },
    [lead, busy, advance],
  );

  const undo = useCallback(async () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setIdx((i) => Math.max(0, i - 1));
    setDone((d) => Math.max(0, d - 1));
    await fetch(`/api/leads/${last.leadId}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "undo" }),
    });
    toast.info("Undone");
  }, [history]);

  const analyzeWebsite = useCallback(async () => {
    if (!lead?.website) {
      toast.error("No website to analyse");
      return;
    }
    toast.loading("Checking website...", { id: "wa" });
    const res = await fetch(`/api/leads/${lead.id}/website`, { method: "POST" });
    if (!res.ok) {
      toast.error("Website check failed", { id: "wa" });
      return;
    }
    const data = await res.json();
    setLeads((prev) =>
      prev.map((l) =>
        l.id === lead.id
          ? {
              ...l,
              websiteScore: data.lead.websiteScore,
              websiteIssues: data.lead.websiteIssues,
              websiteCheckedAt: data.lead.websiteCheckedAt,
              score: data.lead.score,
              tier: data.lead.tier,
              scoreReasons: data.lead.scoreReasons,
              instagramUrl: data.lead.instagramUrl,
              instagramUsername: data.lead.instagramUsername,
            }
          : l,
      ),
    );
    toast.success(`Website scored ${data.lead.websiteScore}/100`, { id: "wa" });
  }, [lead]);

  // Keyboard first: the whole point of this screen is speed.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (adding) return;

      if (rejecting) {
        if (e.key === "Escape") return setRejecting(false);
        const n = Number(e.key);
        if (n >= 1 && n <= REJECT_REASONS.length) {
          e.preventDefault();
          void decide("reject", REJECT_REASONS[n - 1].value);
        }
        return;
      }

      switch (e.key.toLowerCase()) {
        case "k":
          e.preventDefault();
          void decide("keep");
          break;
        case "r":
          e.preventDefault();
          setRejecting(true);
          break;
        case "n":
        case "arrowright":
          e.preventDefault();
          advance();
          break;
        case "p":
        case "arrowleft":
          e.preventDefault();
          setIdx((i) => Math.max(0, i - 1));
          break;
        case "u":
          e.preventDefault();
          void undo();
          break;
        case "m":
          openIn(lead?.mapsUrl);
          break;
        case "w":
          openIn(ensureUrl(lead?.website));
          break;
        case "i":
          openIn(lead?.instagramUrl ?? (lead?.instagramUsername ? `https://instagram.com/${lead.instagramUsername}` : null));
          break;
        case "c":
          openIn(telHref(lead?.phone));
          break;
        case "e":
          openIn(lead?.email ? `mailto:${lead.email}` : null);
          break;
        case "a":
          e.preventDefault();
          void analyzeWebsite();
          break;
        case "+":
        case "=":
          e.preventDefault();
          setAdding(true);
          break;
        case "o":
          if (lead) window.open(`/leads/${lead.id}`, "_blank", "noopener,noreferrer");
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rejecting, adding, decide, advance, undo, openIn, analyzeWebsite, lead]);

  function applySaved(saved: Record<string, unknown>) {
    setLeads((prev) => prev.map((l) => (l.id === saved.id ? ({ ...l, ...saved } as ReviewLead) : l)));
  }

  if (!lead) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <div>
          <p className="text-lg font-semibold">Batch reviewed</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {done} decided in this session. {Math.max(0, remaining - done)} still in the queue.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void undo()} disabled={!history.length}>
            <RotateCcw /> Undo last
          </Button>
          <Button size="sm" onClick={() => router.refresh()}>
            Load next batch
          </Button>
        </div>
      </div>
    );
  }

  const location = [lead.neighborhood, lead.district, lead.city].filter(Boolean).join(", ");

  return (
    <div className="flex min-h-screen flex-col">
      <div className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-border bg-background/95 px-6 py-3 backdrop-blur">
        <div>
          <h1 className="text-base font-semibold">Review</h1>
          <p className="tabnum text-xs text-muted-foreground">
            {idx + 1} of {leads.length} loaded - {Math.max(0, remaining - done)} left in queue
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => void undo()} disabled={!history.length}>
            <RotateCcw /> Undo <kbd className="ml-1">U</kbd>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/leads/${lead.id}`} target="_blank">
              <ExternalLink /> Detail <kbd className="ml-1">O</kbd>
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid flex-1 gap-4 p-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-3">
          <Card className="border-border/80">
            <CardContent className="space-y-4 pt-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-xl font-semibold">{lead.name}</h2>
                    {lead.businessStatus && lead.businessStatus !== "OPERATIONAL" ? (
                      <span className="rounded border border-rose-500/30 bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-300">
                        {lead.businessStatus}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {lead.category ?? "Uncategorised"} - {location || "Location unknown"}
                  </p>
                  {lead.address ? <p className="mt-0.5 text-xs text-muted-foreground">{lead.address}</p> : null}
                </div>
                <div className="shrink-0 text-right">
                  <div className="tabnum text-3xl font-bold leading-none">{lead.score}</div>
                  <TierBadge tier={lead.tier} className="mt-1" />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="tabnum inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-xs">
                  <Star className="size-3 fill-amber-400 text-amber-400" />
                  {lead.rating ?? "-"}
                  <span className="text-muted-foreground">({lead.reviewCount ?? 0})</span>
                </span>
                <WebsiteChip hasWebsite={lead.hasWebsite} websiteScore={lead.websiteScore} issues={lead.websiteIssues} />
                {lead.instagramUrl || lead.instagramUsername ? (
                  <span className="rounded border border-pink-500/30 bg-pink-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-pink-300">
                    Instagram{lead.instagramFollowers ? ` ${lead.instagramFollowers}` : ""}
                  </span>
                ) : (
                  <span className="rounded border border-zinc-500/30 bg-zinc-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-400">
                    No Instagram on file
                  </span>
                )}
                {lead.phone ? null : (
                  <span className="rounded border border-zinc-500/30 bg-zinc-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-400">
                    No phone
                  </span>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Why it scored {lead.score}
                  </div>
                  <ScoreReasons reasons={lead.scoreReasons} />
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Prioritisation only. It does not predict whether they will buy.
                  </p>
                </div>
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Website</div>
                  {!lead.hasWebsite ? (
                    <p className="text-xs text-muted-foreground">No website on Google. Strongest angle we have.</p>
                  ) : !lead.websiteCheckedAt ? (
                    <div className="space-y-2">
                      <p className="truncate text-xs text-muted-foreground">{lead.website}</p>
                      <Button size="xs" variant="outline" onClick={() => void analyzeWebsite()}>
                        <Gauge /> Analyse site <kbd className="ml-1">A</kbd>
                      </Button>
                    </div>
                  ) : lead.websiteIssues.length ? (
                    <ul className="space-y-0.5">
                      {lead.websiteIssues.map((issue) => (
                        <li key={issue} className="text-xs text-amber-300/90">
                          - {issue}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">No obvious problems found.</p>
                  )}
                </div>
              </div>

              <QuickActions lead={lead} />
            </CardContent>
          </Card>

          {adding ? (
            <QuickAdd
              key={lead.id}
              leadId={lead.id}
              initial={{
                instagramUrl: lead.instagramUrl,
                instagramFollowers: lead.instagramFollowers,
                phone: lead.phone,
                email: lead.email,
                website: lead.website,
              }}
              onSaved={applySaved}
              onClose={() => setAdding(false)}
            />
          ) : null}

          {rejecting ? (
            <Card className="border-rose-500/40">
              <CardContent className="pt-4">
                <div className="mb-2 text-xs font-medium">Reject reason - press the number</div>
                <div className="grid gap-1.5 sm:grid-cols-3">
                  {REJECT_REASONS.map((r, i) => (
                    <Button
                      key={r.value}
                      size="sm"
                      variant="outline"
                      className="justify-start"
                      onClick={() => void decide("reject", r.value)}
                    >
                      <kbd>{i + 1}</kbd>
                      {r.label}
                    </Button>
                  ))}
                </div>
                <Button size="xs" variant="ghost" className="mt-2" onClick={() => setRejecting(false)}>
                  Cancel <kbd className="ml-1">Esc</kbd>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="success" onClick={() => void decide("keep")} disabled={busy}>
                <Check /> Keep <kbd className="ml-1">K</kbd>
              </Button>
              <Button variant="destructive" onClick={() => setRejecting(true)} disabled={busy}>
                <X /> Reject <kbd className="ml-1">R</kbd>
              </Button>
              <Button variant="outline" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}>
                <ChevronLeft /> Back <kbd className="ml-1">P</kbd>
              </Button>
              <Button variant="outline" onClick={advance}>
                Skip <kbd className="ml-1">N</kbd> <ChevronRight />
              </Button>
              <Button variant="outline" onClick={() => setAdding((a) => !a)}>
                <Plus /> Add info <kbd className="ml-1">+</kbd>
              </Button>
              <span className="ml-2 text-[10px] text-muted-foreground">
                M maps - W site - I instagram - C call - E email - A analyse - O detail
              </span>
            </div>
          )}
        </div>

        <aside className="hidden lg:block">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Up next</div>
          <ul className="mt-2 space-y-1">
            {upcoming.map((l) => (
              <li key={l.id} className="flex items-center gap-2 rounded border border-border/60 px-2 py-1">
                <span className={cn("tabnum w-7 shrink-0 text-right text-xs font-semibold")}>{l.score}</span>
                <span className="min-w-0 flex-1 truncate text-xs">{l.name}</span>
                {!l.hasWebsite ? <span className="shrink-0 text-[10px] text-red-300">no site</span> : null}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
