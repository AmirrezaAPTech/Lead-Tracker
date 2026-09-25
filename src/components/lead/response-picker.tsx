"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RESPONSE_CLASSES, RESPONSE_CLASS_CLASS, RESPONSE_CLASS_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ResponseClass } from "@/lib/types";

/**
 * Records how a reply went, not just that one arrived. The class is what makes
 * "responded" worth measuring: a price objection and a booked call are both
 * responses, and only one of them moved the deal forward.
 */
export function ResponsePicker({ leadId, current }: { leadId: string; current: ResponseClass }) {
  const router = useRouter();
  const [value, setValue] = useState<ResponseClass>(current);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function record(next: ResponseClass) {
    if (busy) return;
    const prev = value;
    setValue(next);
    setBusy(true);
    const res = await fetch(`/api/leads/${leadId}/response`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ responseClass: next, note: note.trim() || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      setValue(prev);
      return toast.error("Could not record the response");
    }
    setNote("");
    toast.success(`Recorded: ${RESPONSE_CLASS_LABEL[next]}`);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {RESPONSE_CLASSES.map((r) => (
          <button
            key={r.value}
            disabled={busy}
            onClick={() => void record(r.value)}
            className={cn(
              "rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors",
              value === r.value
                ? RESPONSE_CLASS_CLASS[r.value]
                : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What did they actually say? (optional)"
        className="h-7 text-xs"
      />
      <p className="text-[10px] text-muted-foreground">
        Counts towards the active strategy. Anything other than &quot;No response&quot; also marks the lead as
        responded.
      </p>
    </div>
  );
}
