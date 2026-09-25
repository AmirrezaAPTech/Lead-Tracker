"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/quick-actions";
import { STRATEGY_CHANNEL_LABEL } from "@/lib/constants";
import { fmtDate } from "@/lib/utils";
import type { Strategy, StrategyAssignment } from "@/lib/types";

/**
 * The outreach strategy this lead is running, plus the script to copy.
 *
 * Changing the strategy never rewrites the past: the current assignment is
 * closed and a new one opened, so results already recorded stay attributed to
 * the strategy that produced them. The history below makes that visible.
 */
export function StrategyPanel({
  leadId,
  active,
  history,
  strategies,
}: {
  leadId: string;
  active: (StrategyAssignment & { strategy: Strategy | null }) | null;
  history: StrategyAssignment[];
  /** Active strategies only; archived ones cannot be assigned to new leads. */
  strategies: Pick<Strategy, "id" | "name">[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);

  const current = active?.strategy ?? null;
  const past = history.filter((h) => h.id !== active?.id);

  async function assign(strategyId: string | null) {
    setBusy(true);
    const res = await fetch("/api/leads/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [leadId], action: "assign-strategy", strategyId }),
    });
    setBusy(false);
    if (!res.ok) return toast.error("Could not change strategy");
    toast.success(strategyId ? "Strategy assigned" : "Strategy removed");
    setChanging(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {current ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/strategies/${current.id}`} className="text-sm font-medium hover:underline">
              {current.name}
            </Link>
            <Badge className="border-border bg-muted/40 text-muted-foreground">
              {STRATEGY_CHANNEL_LABEL[current.channel]}
            </Badge>
            {current.status === "ARCHIVED" ? (
              <Badge className="border-zinc-500/30 bg-zinc-500/15 text-zinc-400">Archived</Badge>
            ) : null}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Assigned {fmtDate(active!.assignedAt)}
          </div>

          {current.openingMessage ? (
            <div className="rounded-md border border-border/60 bg-muted/20 p-2.5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Opening message</span>
                <CopyButton value={current.openingMessage} label="Opening message copied" />
              </div>
              <p className="whitespace-pre-wrap text-xs">{current.openingMessage}</p>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                Copy, adapt, send by hand. Nothing here is ever sent for you.
              </p>
            </div>
          ) : null}

          {current.followUpApproach ? (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Follow-up approach</div>
              <p className="whitespace-pre-wrap text-xs">{current.followUpApproach}</p>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          No outreach strategy yet. Assign one before the first contact so the result can be attributed.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {current ? (
          <Button size="xs" variant="outline" asChild>
            <Link href={`/strategies/${current.id}`}>
              <ExternalLink /> View strategy
            </Link>
          </Button>
        ) : null}
        {changing ? (
          <>
            <select
              className="h-7 rounded border border-input bg-card px-2 text-xs"
              defaultValue=""
              disabled={busy}
              onChange={(e) => {
                if (!e.target.value) return;
                void assign(e.target.value === "none" ? null : e.target.value);
              }}
            >
              <option value="">Choose strategy...</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              {current ? <option value="none">Remove strategy</option> : null}
            </select>
            <Button size="xs" variant="ghost" onClick={() => setChanging(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button size="xs" variant="outline" disabled={busy} onClick={() => setChanging(true)}>
            {current ? "Change strategy" : "Assign strategy"}
          </Button>
        )}
      </div>

      {past.length ? (
        <div className="border-t border-border/40 pt-2">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Previous strategies</div>
          <ul className="space-y-0.5">
            {past.map((h) => (
              <li key={h.id} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate text-muted-foreground">{h.strategy?.name ?? "Removed strategy"}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {fmtDate(h.assignedAt)} - {h.endedAt ? fmtDate(h.endedAt) : "now"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Results recorded during each period stay with that strategy.
          </p>
        </div>
      ) : null}
    </div>
  );
}
