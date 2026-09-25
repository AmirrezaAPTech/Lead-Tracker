"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { LeadStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { PIPELINE, STATUS_CLASS, STATUS_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** One-click pipeline movement. Also used as the drag-free fallback on the board. */
export function StatusPicker({ leadId, status }: { leadId: string; status: LeadStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(status);

  async function set(next: LeadStatus) {
    if (next === current) return;
    setBusy(true);
    const prev = current;
    setCurrent(next);
    const res = await fetch(`/api/leads/${leadId}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    if (!res.ok) {
      setCurrent(prev);
      toast.error("Could not change status");
      return;
    }
    toast.success(`Moved to ${STATUS_LABEL[next]}`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-1">
      {PIPELINE.map((s) => (
        <button
          key={s}
          disabled={busy}
          onClick={() => void set(s)}
          className={cn(
            "rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors",
            current === s
              ? STATUS_CLASS[s]
              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
          )}
        >
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}
