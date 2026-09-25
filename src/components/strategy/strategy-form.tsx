"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STRATEGY_CHANNELS } from "@/lib/constants";
import type { ContactMethod, Strategy } from "@/lib/types";

type Draft = {
  name: string;
  description: string;
  targetNiche: string;
  targetCriteria: string;
  channel: ContactMethod;
  openingMessage: string;
  followUpApproach: string;
  notes: string;
};

function draftFrom(s?: Strategy | null): Draft {
  return {
    name: s?.name ?? "",
    description: s?.description ?? "",
    targetNiche: s?.targetNiche ?? "",
    targetCriteria: s?.targetCriteria ?? "",
    channel: s?.channel ?? "INSTAGRAM",
    openingMessage: s?.openingMessage ?? "",
    followUpApproach: s?.followUpApproach ?? "",
    notes: s?.notes ?? "",
  };
}

/** Empty strings mean "not set", so they go to the database as null. */
function payload(d: Draft) {
  const clean = (v: string) => (v.trim() ? v.trim() : null);
  return {
    name: d.name.trim(),
    description: clean(d.description),
    targetNiche: clean(d.targetNiche),
    targetCriteria: clean(d.targetCriteria),
    channel: d.channel,
    openingMessage: clean(d.openingMessage),
    followUpApproach: clean(d.followUpApproach),
    notes: clean(d.notes),
  };
}

/**
 * Creates or edits a strategy. Only the name is required - if writing one down
 * is slow, the next test never gets set up.
 */
export function StrategyForm({ strategy, onDone }: { strategy?: Strategy; onDone?: () => void }) {
  const router = useRouter();
  const editing = Boolean(strategy);
  const [open, setOpen] = useState(editing);
  const [d, setD] = useState<Draft>(() => draftFrom(strategy));
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD((p) => ({ ...p, [key]: value }));

  async function save() {
    if (!d.name.trim()) return toast.error("Name the strategy");
    setBusy(true);
    const res = await fetch(editing ? `/api/strategies/${strategy!.id}` : "/api/strategies", {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload(d)),
    });
    setBusy(false);
    if (!res.ok) return toast.error(editing ? "Could not save strategy" : "Could not create strategy");

    toast.success(editing ? "Strategy saved" : "Strategy created");
    if (!editing) {
      setD(draftFrom(null));
      setOpen(false);
    }
    onDone?.();
    router.refresh();
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus /> New strategy
      </Button>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{editing ? "Edit strategy" : "New strategy"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Strategy name</Label>
            <Input
              value={d.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Personalized Demo"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label>Primary channel</Label>
            <select
              value={d.channel}
              onChange={(e) => set("channel", e.target.value as ContactMethod)}
              className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs"
            >
              {STRATEGY_CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Input
              value={d.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Build a demo site first, lead with it"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label>Target niche</Label>
            <Input
              value={d.targetNiche}
              onChange={(e) => set("targetNiche", e.target.value)}
              placeholder="Hair salons"
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label>Target lead criteria / notes</Label>
          <Textarea
            value={d.targetCriteria}
            onChange={(e) => set("targetCriteria", e.target.value)}
            placeholder="Qualified, no website, 500+ Instagram followers"
            rows={2}
            className="text-xs"
          />
        </div>

        <div className="space-y-1">
          <Label>Opening message / script</Label>
          <Textarea
            value={d.openingMessage}
            onChange={(e) => set("openingMessage", e.target.value)}
            placeholder="The first message you send. Nothing is ever sent automatically - this is the script you copy."
            rows={4}
            className="text-xs"
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Follow-up approach</Label>
            <Textarea
              value={d.followUpApproach}
              onChange={(e) => set("followUpApproach", e.target.value)}
              placeholder="Day 2 nudge, day 5 send demo link, day 9 last call"
              rows={3}
              className="text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea
              value={d.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
              className="text-xs"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={() => void save()} disabled={busy}>
            {editing ? "Save" : "Create"}
          </Button>
          {editing ? null : (
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
