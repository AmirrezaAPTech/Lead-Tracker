"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { LeadStatus } from "@/lib/types";
import { Check, Clock, X, Sparkles, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuickActions } from "@/components/quick-actions";
import { StatusBadge } from "@/components/bits";
import { copyText } from "@/components/quick-actions";
import { fmtDate, relativeDays } from "@/lib/utils";

export type FollowUpItem = {
  followUpId: string | null;
  leadId: string;
  name: string;
  status: LeadStatus;
  contactPerson: string | null;
  neighborhood: string | null;
  lastContactAt: string | null;
  nextFollowUpAt: string | null;
  followUpCount: number;
  action: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  mapsUrl: string | null;
  instagramUrl: string | null;
  instagramUsername: string | null;
  suggestedMessage: string | null;
};

export function FollowUpRow({ item, aiEnabled }: { item: FollowUpItem; aiEnabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<string | null>(item.suggestedMessage);

  async function act(action: "done" | "skip" | "snooze", days = 3) {
    if (!item.followUpId) {
      toast.error("No scheduled follow-up on this lead");
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/followups/${item.followUpId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, days }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error("Could not update follow-up");
      return;
    }
    toast.success(action === "done" ? "Logged, next one scheduled" : action === "skip" ? "Skipped" : `Snoozed ${days} days`);
    router.refresh();
  }

  async function generate() {
    if (!aiEnabled) {
      toast.error("Set ANTHROPIC_API_KEY to enable AI drafts");
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/leads/${item.leadId}/ai`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "FOLLOW_UP" }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Draft failed");
      return;
    }
    setDraft(data.output.content);
  }

  const overdue = item.nextFollowUpAt ? new Date(item.nextFollowUpAt) < new Date() : false;

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/leads/${item.leadId}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
          {item.name}
        </Link>
        {item.contactPerson ? <span className="text-xs text-muted-foreground">{item.contactPerson}</span> : null}
        <StatusBadge status={item.status} />
        <span className="tabnum text-[10px] text-muted-foreground">
          {item.action} - last contact {item.lastContactAt ? fmtDate(item.lastContactAt) : "never"} - due{" "}
          <span className={overdue ? "text-amber-300" : ""}>{relativeDays(item.nextFollowUpAt)}</span>
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Button size="xs" variant="success" disabled={busy} onClick={() => void act("done")}>
          <Check /> I sent it
        </Button>
        <Button size="xs" variant="outline" disabled={busy} onClick={() => void act("snooze", 3)}>
          <Clock /> Snooze 3d
        </Button>
        <Button size="xs" variant="ghost" disabled={busy} onClick={() => void act("skip")}>
          <X /> Stop following up
        </Button>
        <Button size="xs" variant="outline" disabled={busy} onClick={() => void generate()}>
          <Sparkles /> Draft message
        </Button>
        <QuickActions lead={item} compact className="ml-auto" />
      </div>

      {draft ? (
        <div className="mt-2 rounded border border-border/60 bg-background/40 p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Draft - review before sending
            </span>
            <Button size="xs" variant="ghost" onClick={() => void copyText(draft, "Draft copied")}>
              <Copy /> Copy
            </Button>
          </div>
          <p className="whitespace-pre-wrap text-xs">{draft}</p>
        </div>
      ) : null}
    </div>
  );
}
