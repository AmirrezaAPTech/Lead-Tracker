"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fmtDateTime } from "@/lib/utils";

export function NotesPanel({
  leadId,
  notes,
}: {
  leadId: string;
  notes: { id: string; body: string; createdAt: string }[];
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!body.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/leads/${leadId}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error("Could not save note");
      return;
    }
    setBody("");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What happened? Owner name, objection, price talked about..."
        className="min-h-16 text-xs"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void add();
        }}
      />
      <Button size="xs" onClick={() => void add()} disabled={busy || !body.trim()}>
        <Plus /> Add note <kbd className="ml-1">Ctrl+Enter</kbd>
      </Button>

      <ul className="space-y-1.5 pt-1">
        {notes.map((n) => (
          <li key={n.id} className="rounded border border-border/60 px-2.5 py-1.5">
            <div className="text-[10px] text-muted-foreground">{fmtDateTime(n.createdAt)}</div>
            <p className="whitespace-pre-wrap text-xs">{n.body}</p>
          </li>
        ))}
        {notes.length === 0 ? <li className="text-xs text-muted-foreground">No notes yet.</li> : null}
      </ul>
    </div>
  );
}
