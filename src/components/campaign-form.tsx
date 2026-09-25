"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SUGGESTED_QUERIES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function CampaignForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("Istanbul");
  const [district, setDistrict] = useState("");
  const [niche, setNiche] = useState("Hair / beauty / nails");
  const [queries, setQueries] = useState<string[]>(["kuafor", "guzellik salonu", "nail salon"]);
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) return toast.error("Name the campaign");
    setBusy(true);
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, city, district: district || undefined, niche, queries }),
    });
    setBusy(false);
    if (!res.ok) return toast.error("Could not create campaign");
    setOpen(false);
    setName("");
    toast.success("Campaign created");
    router.refresh();
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus /> New campaign
      </Button>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>New campaign</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Istanbul Beauty - Nisantasi"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label>Niche</Label>
            <Input value={niche} onChange={(e) => setNiche(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label>City</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label>District / neighbourhood</Label>
            <Input
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              placeholder="Nisantasi"
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label>Queries</Label>
          <div className="flex flex-wrap gap-1">
            {SUGGESTED_QUERIES.map((q) => (
              <button
                key={q}
                onClick={() => setQueries((p) => (p.includes(q) ? p.filter((x) => x !== q) : [...p, q]))}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[10px]",
                  queries.includes(q)
                    ? "border-primary/50 bg-primary/20 text-primary"
                    : "border-border text-muted-foreground",
                )}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={() => void create()} disabled={busy}>
            Create
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
