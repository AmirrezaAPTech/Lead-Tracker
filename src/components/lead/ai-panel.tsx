"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, Instagram, Mail, Phone, RefreshCw, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { copyText } from "@/components/quick-actions";
import { fmtDateTime } from "@/lib/utils";

type Kind = "ANALYSIS" | "INSTAGRAM_OPENER" | "EMAIL" | "CALL_OPENER" | "FOLLOW_UP";

const KIND_LABEL: Record<Kind, string> = {
  ANALYSIS: "Lead analysis",
  INSTAGRAM_OPENER: "Instagram opener",
  EMAIL: "Email",
  CALL_OPENER: "Call opener",
  FOLLOW_UP: "Follow-up",
};

export type AiOutputItem = { id: string; kind: Kind; content: string; model: string | null; createdAt: string };

/** Renders headings from the analysis prompt without pulling in a markdown lib. */
function Rendered({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {text.split("\n").map((line, i) => {
        if (line.startsWith("## ")) {
          return (
            <p key={i} className="pt-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
              {line.slice(3)}
            </p>
          );
        }
        if (!line.trim()) return <div key={i} className="h-1" />;
        return (
          <p key={i} className="whitespace-pre-wrap text-foreground/90">
            {line}
          </p>
        );
      })}
    </div>
  );
}

export function AiPanel({
  leadId,
  aiEnabled,
  history,
}: {
  leadId: string;
  aiEnabled: boolean;
  history: AiOutputItem[];
}) {
  const [outputs, setOutputs] = useState(history);
  const [busy, setBusy] = useState<Kind | null>(null);

  async function run(kind: Kind) {
    if (!aiEnabled) {
      toast.error("Set ANTHROPIC_API_KEY to enable AI");
      return;
    }
    setBusy(kind);
    const res = await fetch(`/api/leads/${leadId}/ai`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    setBusy(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "AI request failed");
      return;
    }
    const data = await res.json();
    setOutputs((prev) => [data.output, ...prev]);
    toast.success(`${KIND_LABEL[kind]} ready - review before sending`);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>AI assist</CardTitle>
        <span className="text-[10px] text-muted-foreground">Generate, review, copy. Nothing is sent automatically.</span>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <Button size="xs" onClick={() => void run("ANALYSIS")} disabled={busy !== null}>
            {busy === "ANALYSIS" ? <RefreshCw className="animate-spin" /> : <Sparkles />} Analyse lead
          </Button>
          <Button size="xs" variant="outline" onClick={() => void run("INSTAGRAM_OPENER")} disabled={busy !== null}>
            <Instagram /> Instagram opener
          </Button>
          <Button size="xs" variant="outline" onClick={() => void run("EMAIL")} disabled={busy !== null}>
            <Mail /> Email
          </Button>
          <Button size="xs" variant="outline" onClick={() => void run("CALL_OPENER")} disabled={busy !== null}>
            <Phone /> Call opener
          </Button>
          <Button size="xs" variant="outline" onClick={() => void run("FOLLOW_UP")} disabled={busy !== null}>
            <RefreshCw /> Follow-up
          </Button>
        </div>

        {outputs.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No drafts yet. Everything generated here uses only the facts stored on this lead.
          </p>
        ) : (
          <div className="space-y-2">
            {outputs.map((o) => (
              <div key={o.id} className="rounded-md border border-border bg-background/40 p-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {KIND_LABEL[o.kind]} - {fmtDateTime(o.createdAt)}
                  </span>
                  <Button size="xs" variant="ghost" onClick={() => void copyText(o.content, "Draft copied")}>
                    <Copy /> Copy
                  </Button>
                </div>
                <Rendered text={o.content} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
