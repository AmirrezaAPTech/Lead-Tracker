"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type QuickAddValues = {
  instagramUrl?: string | null;
  instagramUsername?: string | null;
  instagramFollowers?: number | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  contactPerson?: string | null;
};

type Field = { name: keyof QuickAddValues; label: string; placeholder: string; type?: "text" | "number" };

const FIELDS: Field[] = [
  { name: "instagramUrl", label: "Instagram", placeholder: "instagram.com/salonname or @salonname" },
  { name: "instagramFollowers", label: "Followers", placeholder: "3200", type: "number" },
  { name: "phone", label: "Phone", placeholder: "0212 555 10 01" },
  { name: "email", label: "Email", placeholder: "info@salon.com" },
  { name: "website", label: "Website", placeholder: "salonname.com" },
  { name: "contactPerson", label: "Contact person", placeholder: "Ayla" },
];

/** "@salon", "instagram.com/salon" and a bare handle all mean the same thing. */
function normalizeInstagram(input: string) {
  const value = input.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.includes("instagram.com")) return `https://${value.replace(/^\/+/, "")}`;
  return `https://instagram.com/${value.replace(/^@/, "")}`;
}

/**
 * Adds the things Google does not know: the Instagram account, a direct number,
 * the owner's name. Saved values are protected from later Google imports.
 */
export function QuickAdd({
  leadId,
  initial,
  onSaved,
  onClose,
}: {
  leadId: string;
  initial: QuickAddValues;
  onSaved: (lead: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.name, initial[f.name] == null ? "" : String(initial[f.name])])),
  );
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
  }, []);

  async function save() {
    const payload: Record<string, unknown> = {};
    for (const f of FIELDS) {
      const raw = values[f.name].trim();
      const before = initial[f.name] == null ? "" : String(initial[f.name]);
      if (raw === before) continue;
      if (!raw) {
        payload[f.name] = null;
      } else if (f.name === "instagramUrl") {
        payload[f.name] = normalizeInstagram(raw);
      } else if (f.type === "number") {
        payload[f.name] = Number(raw);
      } else {
        payload[f.name] = raw;
      }
    }

    if (!Object.keys(payload).length) {
      onClose();
      return;
    }

    setBusy(true);
    const res = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not save");
      return;
    }

    const data = await res.json();
    onSaved(data.lead);
    toast.success("Saved - the score has been updated");
    onClose();
  }

  return (
    <div
      className="rounded-lg border border-primary/40 bg-card p-3"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void save();
        }
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium">Add what Google does not have</span>
        <span className="text-[10px] text-muted-foreground">
          <kbd>Ctrl+Enter</kbd> save - <kbd>Esc</kbd> cancel
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {FIELDS.map((f, i) => (
          <div key={f.name} className="space-y-1">
            <Label htmlFor={`qa-${f.name}`}>{f.label}</Label>
            <Input
              id={`qa-${f.name}`}
              ref={i === 0 ? first : undefined}
              type={f.type === "number" ? "number" : "text"}
              value={values[f.name]}
              placeholder={f.placeholder}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              className="h-8 text-xs"
            />
          </div>
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        <Button size="xs" disabled={busy} onClick={() => void save()}>
          <Save /> {busy ? "Saving..." : "Save"}
        </Button>
        <Button size="xs" variant="ghost" onClick={onClose}>
          <X /> Cancel
        </Button>
      </div>
    </div>
  );
}
