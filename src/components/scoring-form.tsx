"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type ScoringValues = {
  noWebsite: number;
  websiteProblems: number;
  instagramActive: number;
  instagramFollowers: number;
  manyReviews: number;
  highRating: number;
  premiumNeighborhood: number;
  appointmentBased: number;
  followerThreshold: number;
  reviewThreshold: number;
  ratingThreshold: number;
  hotMin: number;
  goodMin: number;
  maybeMin: number;
  premiumNeighborhoods: string[];
  appointmentTypes: string[];
  followUpDays: number[];
};

const WEIGHTS: { key: keyof ScoringValues; label: string }[] = [
  { key: "noWebsite", label: "No website" },
  { key: "websiteProblems", label: "Obvious website problems" },
  { key: "instagramActive", label: "Active Instagram" },
  { key: "instagramFollowers", label: "Followers above threshold" },
  { key: "manyReviews", label: "Reviews above threshold" },
  { key: "highRating", label: "Rating above threshold" },
  { key: "premiumNeighborhood", label: "Premium neighbourhood" },
  { key: "appointmentBased", label: "Appointment-based business" },
];

const THRESHOLDS: { key: keyof ScoringValues; label: string; step?: string }[] = [
  { key: "followerThreshold", label: "Follower threshold" },
  { key: "reviewThreshold", label: "Review threshold" },
  { key: "ratingThreshold", label: "Rating threshold", step: "0.1" },
  { key: "hotMin", label: "HOT from" },
  { key: "goodMin", label: "GOOD from" },
  { key: "maybeMin", label: "MAYBE from" },
];

export function ScoringForm({ initial }: { initial: ScoringValues }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);

  const num = (key: keyof ScoringValues) => String(v[key] as number);
  const setNum = (key: keyof ScoringValues, value: string) =>
    setV((prev) => ({ ...prev, [key]: value === "" ? 0 : Number(value) }));

  async function save() {
    setBusy(true);
    const res = await fetch("/api/settings/scoring", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(v),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Could not save settings");
      return;
    }
    toast.success(`Saved. Rescored ${data.total} leads (${data.updated} changed).`);
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Score weights</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {WEIGHTS.map((w) => (
            <div key={String(w.key)} className="space-y-1">
              <Label>{w.label}</Label>
              <Input
                type="number"
                value={num(w.key)}
                onChange={(e) => setNum(w.key, e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          ))}
          <p className="col-span-full text-[10px] text-muted-foreground">
            The total is capped at 100. This is a prioritisation score, not a prediction of who will buy.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Thresholds and tiers</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {THRESHOLDS.map((t) => (
            <div key={String(t.key)} className="space-y-1">
              <Label>{t.label}</Label>
              <Input
                type="number"
                step={t.step}
                value={num(t.key)}
                onChange={(e) => setNum(t.key, e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          ))}
          <div className="space-y-1 sm:col-span-2">
            <Label>Follow-up schedule (days after contact)</Label>
            <Input
              value={v.followUpDays.join(", ")}
              onChange={(e) =>
                setV((prev) => ({
                  ...prev,
                  followUpDays: e.target.value
                    .split(",")
                    .map((x) => Number(x.trim()))
                    .filter((x) => !Number.isNaN(x) && x > 0),
                }))
              }
              className="h-8 text-xs"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Premium neighbourhoods</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={v.premiumNeighborhoods.join("\n")}
            onChange={(e) => setV((prev) => ({ ...prev, premiumNeighborhoods: e.target.value.split("\n") }))}
            className="min-h-48 font-mono text-xs"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            One per line. Matched against neighbourhood, district and address, accent-insensitive.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appointment-based place types</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={v.appointmentTypes.join("\n")}
            onChange={(e) => setV((prev) => ({ ...prev, appointmentTypes: e.target.value.split("\n") }))}
            className="min-h-48 font-mono text-xs"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Google place types, one per line, e.g. hair_salon, beauty_salon, nail_salon.
          </p>
        </CardContent>
      </Card>

      <div className="lg:col-span-2">
        <Button onClick={() => void save()} disabled={busy}>
          <Save /> {busy ? "Saving and rescoring..." : "Save and rescore all leads"}
        </Button>
      </div>
    </div>
  );
}
