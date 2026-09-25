"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ContactMethod } from "@/lib/types";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONTACT_METHODS } from "@/lib/constants";

/**
 * Logs a message I already sent by hand. The app never sends anything itself -
 * this only records the contact and schedules the next follow-up.
 */
export function ContactBar({ leadId, defaultMethod }: { leadId: string; defaultMethod?: ContactMethod | null }) {
  const router = useRouter();
  const [method, setMethod] = useState<ContactMethod>(defaultMethod ?? "INSTAGRAM");
  const [busy, setBusy] = useState(false);

  async function log() {
    setBusy(true);
    const res = await fetch(`/api/leads/${leadId}/contact`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error("Could not log contact");
      return;
    }
    toast.success("Contact logged, follow-up scheduled");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={method}
        onChange={(e) => setMethod(e.target.value as ContactMethod)}
        className="h-8 rounded-md border border-input bg-card px-2 text-xs"
      >
        {CONTACT_METHODS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <Button size="sm" disabled={busy} onClick={() => void log()}>
        <Send /> I sent it
      </Button>
    </div>
  );
}
