"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { LeadStatus, LeadTier } from "@/lib/types";
import { Star, Gauge, Check, X, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuickActions } from "@/components/quick-actions";
import { StatusBadge, TierBadge, WebsiteChip } from "@/components/bits";
import { PIPELINE, REJECT_REASONS, STATUS_LABEL } from "@/lib/constants";
import { cn, relativeDays } from "@/lib/utils";

export type LeadRow = {
  id: string;
  name: string;
  category: string | null;
  neighborhood: string | null;
  district: string | null;
  rating: number | null;
  reviewCount: number | null;
  hasWebsite: boolean;
  website: string | null;
  websiteScore: number | null;
  websiteIssues: string[];
  instagramUrl: string | null;
  instagramUsername: string | null;
  phone: string | null;
  email: string | null;
  mapsUrl: string | null;
  score: number;
  tier: LeadTier;
  status: LeadStatus;
  nextFollowUpAt: string | null;
  pinned: boolean;
};

export type StrategyOption = { id: string; name: string };

export function LeadTable({
  leads,
  strategies = [],
}: {
  leads: LeadRow[];
  /** Active strategies only - archived ones are not assignable to new leads. */
  strategies?: StrategyOption[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const allSelected = leads.length > 0 && selected.size === leads.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulk(action: string, extra: Record<string, unknown> = {}) {
    if (!selected.size) return;
    setBusy(true);
    const res = await fetch("/api/leads/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected), action, ...extra }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error("Bulk action failed");
      return;
    }
    const data = await res.json();
    toast.success(
      data.unchanged
        ? `Applied to ${data.count} leads (${data.unchanged} already had it)`
        : `Applied to ${data.count} leads`,
    );
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div>
      {selected.size > 0 ? (
        <div className="sticky top-[57px] z-10 flex flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/10 px-6 py-2">
          <span className="tabnum text-xs font-medium">{selected.size} selected</span>
          <Button size="xs" variant="success" disabled={busy} onClick={() => void bulk("keep")}>
            <Check /> Keep
          </Button>
          <select
            className="h-7 rounded border border-input bg-card px-2 text-xs"
            defaultValue=""
            disabled={busy}
            onChange={(e) => {
              if (e.target.value) void bulk("reject", { reason: e.target.value });
              e.target.value = "";
            }}
          >
            <option value="">Reject with reason...</option>
            {REJECT_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <select
            className="h-7 rounded border border-input bg-card px-2 text-xs"
            defaultValue=""
            disabled={busy}
            onChange={(e) => {
              if (e.target.value) void bulk("status", { status: e.target.value });
              e.target.value = "";
            }}
          >
            <option value="">Set status...</option>
            {PIPELINE.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          {strategies.length ? (
            <select
              className="h-7 rounded border border-input bg-card px-2 text-xs"
              defaultValue=""
              disabled={busy}
              onChange={(e) => {
                if (e.target.value) {
                  void bulk("assign-strategy", {
                    strategyId: e.target.value === "none" ? null : e.target.value,
                  });
                }
                e.target.value = "";
              }}
            >
              <option value="">Assign strategy...</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="none">Remove strategy</option>
            </select>
          ) : null}
          <Button size="xs" variant="outline" disabled={busy} onClick={() => void bulk("analyze-websites")}>
            <Gauge /> Analyse websites (max 40)
          </Button>
          <Button size="xs" variant="outline" disabled={busy} onClick={() => void bulk("pin")}>
            <Pin /> Pin
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setSelected(new Set())}>
            <X /> Clear
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(leads.map((l) => l.id)))}
                />
              </th>
              <th className="w-16 px-2 py-2 text-left">Score</th>
              <th className="px-2 py-2 text-left">Business</th>
              <th className="w-36 px-2 py-2 text-left">Area</th>
              <th className="w-24 px-2 py-2 text-left">Google</th>
              <th className="w-36 px-2 py-2 text-left">Website</th>
              <th className="w-24 px-2 py-2 text-left">Status</th>
              <th className="w-24 px-2 py-2 text-left">Follow-up</th>
              <th className="w-52 px-2 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr
                key={lead.id}
                className={cn("border-b border-border/50 hover:bg-accent/30", selected.has(lead.id) && "bg-primary/5")}
              >
                <td className="px-3 py-1.5">
                  <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggle(lead.id)} />
                </td>
                <td className="px-2 py-1.5">
                  <TierBadge tier={lead.tier} score={lead.score} />
                </td>
                <td className="max-w-0 px-2 py-1.5">
                  <Link href={`/leads/${lead.id}`} className="block truncate font-medium hover:underline">
                    {lead.pinned ? "* " : ""}
                    {lead.name}
                  </Link>
                  <span className="block truncate text-[10px] text-muted-foreground">{lead.category ?? "-"}</span>
                </td>
                <td className="px-2 py-1.5 text-xs text-muted-foreground">
                  <span className="block truncate">{lead.neighborhood ?? "-"}</span>
                  <span className="block truncate text-[10px]">{lead.district ?? ""}</span>
                </td>
                <td className="tabnum px-2 py-1.5 text-xs">
                  <span className="inline-flex items-center gap-1">
                    <Star className="size-3 fill-amber-400 text-amber-400" />
                    {lead.rating ?? "-"}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">{lead.reviewCount ?? 0} reviews</span>
                </td>
                <td className="px-2 py-1.5">
                  <WebsiteChip hasWebsite={lead.hasWebsite} websiteScore={lead.websiteScore} issues={lead.websiteIssues} />
                </td>
                <td className="px-2 py-1.5">
                  <StatusBadge status={lead.status} />
                </td>
                <td className="px-2 py-1.5 text-xs text-muted-foreground">
                  {lead.nextFollowUpAt ? relativeDays(lead.nextFollowUpAt) : "-"}
                </td>
                <td className="px-2 py-1.5">
                  <QuickActions lead={lead} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
