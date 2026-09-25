"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState, useEffect } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ALL_STATUSES, STATUS_LABEL, DEMO_STATUSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

function NativeSelect({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-8 rounded-md border border-input bg-card px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function LeadFilters({
  campaigns,
  neighborhoods,
  strategies = [],
}: {
  campaigns: { id: string; name: string }[];
  neighborhoods: string[];
  strategies?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (!value || value === "all") next.delete(key);
      else next.set(key, value);
      router.push(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) setParam("q", q);
    }, 350);
    return () => clearTimeout(t);
  }, [q, params, setParam]);

  const get = (k: string, fallback = "all") => params.get(k) ?? fallback;
  const activeCount = Array.from(params.keys()).filter((k) => k !== "sort" && k !== "page").length;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-2">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name, address, phone..."
        className="h-8 w-56 text-xs"
      />
      <NativeSelect
        value={get("status")}
        onChange={(v) => setParam("status", v)}
        options={[
          { value: "all", label: "Status: all" },
          { value: "active", label: "Status: active only" },
          { value: "review", label: "Status: needs review" },
          ...ALL_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
        ]}
      />
      <NativeSelect
        value={get("tier")}
        onChange={(v) => setParam("tier", v)}
        options={[
          { value: "all", label: "Tier: all" },
          { value: "HOT", label: "HOT" },
          { value: "GOOD", label: "GOOD" },
          { value: "MAYBE", label: "MAYBE" },
          { value: "LOW", label: "LOW" },
        ]}
      />
      <NativeSelect
        value={get("website")}
        onChange={(v) => setParam("website", v)}
        options={[
          { value: "all", label: "Website: any" },
          { value: "none", label: "No website" },
          { value: "has", label: "Has website" },
          { value: "problems", label: "Website problems" },
          { value: "unchecked", label: "Not checked yet" },
        ]}
      />
      <NativeSelect
        value={get("instagram")}
        onChange={(v) => setParam("instagram", v)}
        options={[
          { value: "all", label: "Instagram: any" },
          { value: "yes", label: "Has Instagram" },
          { value: "no", label: "No Instagram" },
        ]}
      />
      <NativeSelect
        value={get("campaign")}
        onChange={(v) => setParam("campaign", v)}
        options={[{ value: "all", label: "Campaign: all" }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]}
      />
      {strategies.length ? (
        <NativeSelect
          value={get("strategy")}
          onChange={(v) => setParam("strategy", v)}
          options={[
            { value: "all", label: "Strategy: all" },
            ...strategies.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
      ) : null}
      <NativeSelect
        value={get("neighborhood")}
        onChange={(v) => setParam("neighborhood", v)}
        options={[
          { value: "all", label: "Area: all" },
          ...neighborhoods.map((n) => ({ value: n, label: n })),
        ]}
      />
      <NativeSelect
        value={get("demo")}
        onChange={(v) => setParam("demo", v)}
        options={[{ value: "all", label: "Demo: any" }, ...DEMO_STATUSES.map((d) => ({ value: d.value, label: `Demo: ${d.label}` }))]}
      />
      <NativeSelect
        value={get("due", "")}
        onChange={(v) => setParam("due", v)}
        options={[
          { value: "", label: "Follow-up: any" },
          { value: "today", label: "Due today" },
          { value: "any", label: "Has follow-up" },
        ]}
      />
      <Input
        type="number"
        value={params.get("minReviews") ?? ""}
        onChange={(e) => setParam("minReviews", e.target.value)}
        placeholder="Min reviews"
        className="h-8 w-24 text-xs"
      />
      <Input
        type="number"
        step="0.1"
        value={params.get("minRating") ?? ""}
        onChange={(e) => setParam("minRating", e.target.value)}
        placeholder="Min rating"
        className="h-8 w-24 text-xs"
      />

      <div className="ml-auto flex items-center gap-2">
        <NativeSelect
          value={get("sort", "score")}
          onChange={(v) => setParam("sort", v)}
          options={[
            { value: "score", label: "Sort: highest score" },
            { value: "newest", label: "Sort: newest" },
            { value: "due", label: "Sort: follow-up due" },
            { value: "rating", label: "Sort: rating" },
            { value: "reviews", label: "Sort: review count" },
            { value: "name", label: "Sort: name" },
          ]}
        />
        {activeCount > 0 ? (
          <Button size="xs" variant="ghost" onClick={() => router.push(pathname)}>
            <X /> Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}
