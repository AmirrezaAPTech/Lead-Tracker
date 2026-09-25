"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MAX = 4;

/** Pick 2-4 strategies to put side by side. Nothing else to configure. */
export function ComparePicker({
  strategies,
  selected,
}: {
  strategies: { id: string; name: string }[];
  selected: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
    if (next.length > MAX) return toast.error(`Compare at most ${MAX} strategies at a time`);

    const query = new URLSearchParams(params.toString());
    if (next.length) query.set("ids", next.join(","));
    else query.delete("ids");
    router.push(`${pathname}?${query.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-6 py-2">
      <span className="mr-1 text-[10px] uppercase tracking-wide text-muted-foreground">Compare</span>
      {strategies.map((s) => (
        <button
          key={s.id}
          onClick={() => toggle(s.id)}
          className={cn(
            "rounded border px-2 py-1 text-xs transition-colors",
            selected.includes(s.id)
              ? "border-primary/50 bg-primary/20 text-primary"
              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
          )}
        >
          {s.name}
        </button>
      ))}
      {strategies.length === 0 ? (
        <span className="text-xs text-muted-foreground">No strategies yet.</span>
      ) : null}
    </div>
  );
}
