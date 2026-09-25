"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Download, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SUGGESTED_QUERIES } from "@/lib/constants";
import { cn } from "@/lib/utils";

type PreviewRow = {
  placeId: string;
  name: string;
  address: string | null;
  rating: number | null;
  reviewCount: number | null;
  website: string | null;
  phone: string | null;
  businessStatus: string | null;
  mapsUrl: string | null;
  existing: { id: string; status: string } | null;
  belowMinReviews: boolean;
};

export function DiscoverForm({ campaigns }: { campaigns: { id: string; name: string; queries: string[] }[] }) {
  const router = useRouter();
  const [campaignId, setCampaignId] = useState("");
  const [city, setCity] = useState("Istanbul");
  const [neighborhood, setNeighborhood] = useState("");
  const [queries, setQueries] = useState<string[]>(["kuafor"]);
  const [custom, setCustom] = useState("");
  const [minRating, setMinRating] = useState("");
  const [minReviews, setMinReviews] = useState("");
  const [fieldTier, setFieldTier] = useState<"BASIC" | "FULL">("FULL");
  const [maxPages, setMaxPages] = useState(1);
  const [preview, setPreview] = useState<{ results: PreviewRow[]; apiCalls: number } | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);

  function toggleQuery(q: string) {
    setQueries((prev) => (prev.includes(q) ? prev.filter((x) => x !== q) : [...prev, q]));
  }

  function addCustom() {
    const q = custom.trim();
    if (!q) return;
    if (!queries.includes(q)) setQueries((p) => [...p, q]);
    setCustom("");
  }

  function applyCampaign(id: string) {
    setCampaignId(id);
    const c = campaigns.find((x) => x.id === id);
    if (c?.queries.length) setQueries(c.queries);
  }

  const body = () => ({
    city,
    neighborhood: neighborhood || undefined,
    minRating: minRating ? Number(minRating) : undefined,
    minReviews: minReviews ? Number(minReviews) : undefined,
    fieldTier,
    maxPages,
  });

  async function runPreview() {
    if (!queries.length) return toast.error("Pick at least one query");
    setBusy("preview");
    const res = await fetch("/api/places/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body(), query: queries[0] }),
    });
    setBusy(null);
    const data = await res.json();
    if (!res.ok) return toast.error(data.error ?? "Search failed");
    setPreview(data);
    toast.success(`${data.total} results - ${data.newCount} new, ${data.duplicates} already in database`);
  }

  async function runImport() {
    if (!queries.length) return toast.error("Pick at least one query");
    setBusy("import");
    const res = await fetch("/api/places/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body(), queries, campaignId: campaignId || undefined }),
    });
    setBusy(null);
    const data = await res.json();
    if (!res.ok) return toast.error(data.error ?? "Import failed");
    toast.success(`${data.created} new leads, ${data.duplicates} duplicates skipped, ${data.apiCalls} API calls`);
    router.push("/review");
  }

  return (
    <div className="grid gap-4 p-6 xl:grid-cols-[24rem_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Search Google Places</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Campaign</Label>
            <select
              value={campaignId}
              onChange={(e) => applyCampaign(e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs"
            >
              <option value="">No campaign (ad-hoc)</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>City</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label>Neighbourhood</Label>
              <Input
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                placeholder="Nisantasi"
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Queries ({queries.length})</Label>
            <div className="flex flex-wrap gap-1">
              {SUGGESTED_QUERIES.map((q) => (
                <button
                  key={q}
                  onClick={() => toggleQuery(q)}
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-[10px] transition-colors",
                    queries.includes(q)
                      ? "border-primary/50 bg-primary/20 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {q}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <Input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustom()}
                placeholder="Custom query"
                className="h-8 text-xs"
              />
              <Button size="xs" variant="outline" onClick={addCustom}>
                <Plus />
              </Button>
            </div>
            {queries.length ? (
              <div className="flex flex-wrap gap-1 pt-1">
                {queries.map((q) => (
                  <span key={q} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                    {q}
                    <button onClick={() => toggleQuery(q)} className="text-muted-foreground hover:text-foreground">
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Min rating</Label>
              <Input
                type="number"
                step="0.1"
                value={minRating}
                onChange={(e) => setMinRating(e.target.value)}
                placeholder="4.0"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label>Min reviews</Label>
              <Input
                type="number"
                value={minReviews}
                onChange={(e) => setMinReviews(e.target.value)}
                placeholder="20"
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Fields requested (cost)</Label>
            <select
              value={fieldTier}
              onChange={(e) => setFieldTier(e.target.value as "BASIC" | "FULL")}
              className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs"
            >
              <option value="FULL">Full - rating, reviews, phone, website</option>
              <option value="BASIC">Basic - name and address only (cheapest)</option>
            </select>
            <p className="text-[10px] text-muted-foreground">
              Basic skips the billable fields. Scoring needs rating, reviews and website, so Full is the default.
            </p>
          </div>

          <div className="space-y-1">
            <Label>Pages per query (20 results each)</Label>
            <select
              value={maxPages}
              onChange={(e) => setMaxPages(Number(e.target.value))}
              className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs"
            >
              <option value={1}>1 page - up to 20</option>
              <option value={2}>2 pages - up to 40</option>
              <option value={3}>3 pages - up to 60 (Google maximum)</option>
            </select>
            <p className="text-[10px] text-muted-foreground">
              Estimated requests for this run: {queries.length * maxPages}
            </p>
          </div>

          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => void runPreview()} disabled={busy !== null}>
              <Search /> {busy === "preview" ? "Searching..." : "Preview first query"}
            </Button>
            <Button size="sm" onClick={() => void runImport()} disabled={busy !== null}>
              <Download /> {busy === "import" ? "Importing..." : "Import all queries"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Preview</CardTitle>
          {preview ? (
            <span className="text-[10px] text-muted-foreground">
              {preview.results.length} results - {preview.apiCalls} API request(s)
            </span>
          ) : null}
        </CardHeader>
        <CardContent>
          {!preview ? (
            <p className="py-10 text-center text-xs text-muted-foreground">
              Preview shows what a query returns and which businesses are already in the database. Nothing is saved
              until you press Import.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="border-b border-border text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left">Business</th>
                  <th className="w-20 px-2 py-1.5 text-left">Rating</th>
                  <th className="w-24 px-2 py-1.5 text-left">Website</th>
                  <th className="w-28 px-2 py-1.5 text-left">State</th>
                </tr>
              </thead>
              <tbody>
                {preview.results.map((r) => (
                  <tr key={r.placeId} className="border-b border-border/40">
                    <td className="max-w-0 px-2 py-1.5">
                      <div className="truncate font-medium">{r.name}</div>
                      <div className="truncate text-[10px] text-muted-foreground">{r.address}</div>
                    </td>
                    <td className="tabnum px-2 py-1.5">
                      {r.rating ?? "-"} <span className="text-muted-foreground">({r.reviewCount ?? 0})</span>
                    </td>
                    <td className="px-2 py-1.5">
                      {r.website ? (
                        <span className="text-muted-foreground">has site</span>
                      ) : (
                        <span className="text-red-300">none</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {r.existing ? (
                        <span className="text-amber-300">duplicate</span>
                      ) : r.belowMinReviews ? (
                        <span className="text-muted-foreground">below min reviews</span>
                      ) : (
                        <span className="text-emerald-300">new</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
