"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STRATEGY_CHANNELS } from "@/lib/constants";
import { DATE_RANGES } from "@/lib/strategy";
import { cn } from "@/lib/utils";

function NativeSelect({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
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

/**
 * Date range narrows the events counted; niche, channel and status narrow which
 * strategies are listed. Enough to ask "Instagram vs Phone over the last 14
 * days" without turning this into an analytics engine.
 */
export function StrategyFilters({ niches }: { niches: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (!value || value === "all") next.delete(key);
      else next.set(key, value);
      router.push(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  const get = (k: string, fallback = "all") => params.get(k) ?? fallback;
  const active = Array.from(params.keys()).filter((k) => k !== "ids").length;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-2">
      <NativeSelect
        value={get("range", "all")}
        onChange={(v) => setParam("range", v)}
        options={DATE_RANGES.map((r) => ({ value: r.value, label: r.label }))}
      />
      <NativeSelect
        value={get("channel")}
        onChange={(v) => setParam("channel", v)}
        options={[
          { value: "all", label: "Channel: all" },
          ...STRATEGY_CHANNELS.map((c) => ({ value: c.value, label: c.label })),
        ]}
      />
      <NativeSelect
        value={get("niche")}
        onChange={(v) => setParam("niche", v)}
        options={[{ value: "all", label: "Niche: all" }, ...niches.map((n) => ({ value: n, label: n }))]}
      />
      <NativeSelect
        value={get("status", "ACTIVE")}
        onChange={(v) => setParam("status", v)}
        options={[
          { value: "ACTIVE", label: "Active strategies" },
          { value: "ARCHIVED", label: "Archived strategies" },
          { value: "all", label: "All strategies" },
        ]}
      />
      {active > 0 ? (
        <Button size="xs" variant="ghost" onClick={() => router.push(pathname)}>
          <X /> Clear
        </Button>
      ) : null}
    </div>
  );
}
