"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export type FieldSpec = {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "datetime" | "select" | "bool" | "textarea";
  options?: { value: string; label: string }[];
  placeholder?: string;
  full?: boolean;
};

type Values = Record<string, unknown>;

function toInput(value: unknown, type: FieldSpec["type"]) {
  if (value === null || value === undefined) return "";
  if (type === "date") return String(value).slice(0, 10);
  if (type === "datetime") return String(value).slice(0, 16);
  if (type === "bool") return value === true ? "true" : value === false ? "false" : "";
  return String(value);
}

/** Small generic editor so every section of the lead page saves the same way. */
export function EditForm({
  leadId,
  fields,
  initial,
  columns = 2,
  manualFields = [],
}: {
  leadId: string;
  fields: FieldSpec[];
  initial: Values;
  columns?: number;
  /** Columns already edited by hand - shown so it is clear Google will not overwrite them. */
  manualFields?: string[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, toInput(initial[f.name], f.type)])),
  );
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  function set(name: string, value: string) {
    setValues((v) => ({ ...v, [name]: value }));
    setDirty(true);
  }

  async function save() {
    setBusy(true);

    // Only changed fields are sent: the server records each one as hand-edited,
    // so submitting untouched fields would lock them against Google for no reason.
    const payload: Values = {};
    for (const f of fields) {
      const raw = values[f.name];
      if (raw === toInput(initial[f.name], f.type)) continue;
      if (raw === "" || raw === undefined) {
        payload[f.name] = f.type === "select" ? undefined : null;
        continue;
      }
      if (f.type === "number") payload[f.name] = Number(raw);
      else if (f.type === "bool") payload[f.name] = raw === "true";
      else payload[f.name] = raw;
    }

    if (Object.keys(payload).length === 0) {
      setBusy(false);
      setDirty(false);
      return;
    }

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
    setDirty(false);
    toast.success("Saved");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className={columns === 1 ? "space-y-2.5" : "grid gap-2.5 sm:grid-cols-2"}>
        {fields.map((f) => (
          <div key={f.name} className={`space-y-1 ${f.full ? "sm:col-span-2" : ""}`}>
            <Label htmlFor={`${leadId}-${f.name}`} className="flex items-center gap-1.5">
              {f.label}
              {manualFields.includes(f.name) ? (
                <span
                  title="Edited by hand. Google imports will not overwrite this."
                  className="rounded bg-primary/20 px-1 text-[9px] font-semibold text-primary"
                >
                  YOURS
                </span>
              ) : null}
            </Label>
            {f.type === "textarea" ? (
              <Textarea
                id={`${leadId}-${f.name}`}
                value={values[f.name]}
                placeholder={f.placeholder}
                onChange={(e) => set(f.name, e.target.value)}
                className="min-h-16 text-xs"
              />
            ) : f.type === "select" || f.type === "bool" ? (
              <select
                id={`${leadId}-${f.name}`}
                value={values[f.name]}
                onChange={(e) => set(f.name, e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs"
              >
                {f.type === "bool" ? (
                  <>
                    <option value="">Unknown</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </>
                ) : (
                  (f.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))
                )}
              </select>
            ) : (
              <Input
                id={`${leadId}-${f.name}`}
                type={f.type === "datetime" ? "datetime-local" : f.type === "date" ? "date" : f.type}
                value={values[f.name]}
                placeholder={f.placeholder}
                onChange={(e) => set(f.name, e.target.value)}
                className="h-8 text-xs"
              />
            )}
          </div>
        ))}
      </div>
      <Button size="xs" onClick={() => void save()} disabled={busy || !dirty}>
        <Save /> {busy ? "Saving..." : dirty ? "Save changes" : "Saved"}
      </Button>
    </div>
  );
}
