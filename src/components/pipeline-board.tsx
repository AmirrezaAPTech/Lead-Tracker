"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { LeadStatus, LeadTier } from "@/lib/types";
import { PIPELINE, STATUS_CLASS, STATUS_LABEL } from "@/lib/constants";
import { cn, money, relativeDays } from "@/lib/utils";
import { TierBadge } from "@/components/bits";

export type BoardLead = {
  id: string;
  name: string;
  status: LeadStatus;
  tier: LeadTier;
  score: number;
  neighborhood: string | null;
  nextFollowUpAt: string | null;
  priceQuoted: number | null;
  dealValue: number | null;
  hasWebsite: boolean;
};

/** Drag a card to a column, or open the lead and use the status buttons. */
export function PipelineBoard({ leads: initial }: { leads: BoardLead[] }) {
  const router = useRouter();
  const [leads, setLeads] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<LeadStatus | null>(null);

  async function move(id: string, status: LeadStatus) {
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.status === status) return;
    const previous = lead.status;
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));

    const res = await fetch(`/api/leads/${id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: previous } : l)));
      toast.error("Could not move lead");
      return;
    }
    toast.success(`${lead.name} -> ${STATUS_LABEL[status]}`, { duration: 1200 });
    router.refresh();
  }

  return (
    <div className="flex gap-3 overflow-x-auto p-6">
      {PIPELINE.map((status) => {
        const column = leads.filter((l) => l.status === status);
        const value = column.reduce((sum, l) => sum + (l.dealValue ?? l.priceQuoted ?? 0), 0);
        return (
          <div
            key={status}
            onDragOver={(e) => {
              e.preventDefault();
              setOverStatus(status);
            }}
            onDragLeave={() => setOverStatus((s) => (s === status ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setOverStatus(null);
              if (dragId) void move(dragId, status);
              setDragId(null);
            }}
            className={cn(
              "flex w-60 shrink-0 flex-col rounded-lg border bg-card/40 transition-colors",
              overStatus === status ? "border-primary/60 bg-primary/5" : "border-border",
            )}
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-2">
              <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase", STATUS_CLASS[status])}>
                {STATUS_LABEL[status]}
              </span>
              <span className="tabnum text-[10px] text-muted-foreground">
                {column.length}
                {value > 0 ? ` - ${money(value)}` : ""}
              </span>
            </div>

            <div className="flex-1 space-y-1.5 p-2">
              {column.map((lead) => (
                <div
                  key={lead.id}
                  draggable
                  onDragStart={() => setDragId(lead.id)}
                  onDragEnd={() => setDragId(null)}
                  className={cn(
                    "cursor-grab rounded-md border border-border/70 bg-card px-2 py-1.5 active:cursor-grabbing",
                    dragId === lead.id && "opacity-50",
                  )}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <Link href={`/leads/${lead.id}`} className="min-w-0 flex-1 truncate text-xs font-medium hover:underline">
                      {lead.name}
                    </Link>
                    <TierBadge tier={lead.tier} score={lead.score} />
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="truncate">{lead.neighborhood ?? ""}</span>
                    {lead.nextFollowUpAt ? <span className="shrink-0">{relativeDays(lead.nextFollowUpAt)}</span> : null}
                  </div>
                  {!lead.hasWebsite ? <span className="text-[10px] text-red-300">no website</span> : null}
                </div>
              ))}
              {column.length === 0 ? (
                <p className="py-4 text-center text-[10px] text-muted-foreground">Drop here</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
