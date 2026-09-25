"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StrategyStatus } from "@/lib/types";

/**
 * Archiving retires a strategy from new assignments and keeps every number it
 * has already produced. There is no delete here on purpose.
 */
export function ArchiveButton({ strategyId, status }: { strategyId: string; status: StrategyStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const archived = status === "ARCHIVED";

  async function toggle() {
    setBusy(true);
    const res = await fetch(`/api/strategies/${strategyId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: archived ? "ACTIVE" : "ARCHIVED" }),
    });
    setBusy(false);
    if (!res.ok) return toast.error("Could not change the strategy status");
    toast.success(archived ? "Strategy reactivated" : "Strategy archived - history kept");
    router.refresh();
  }

  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={() => void toggle()}>
      {archived ? <ArchiveRestore /> : <Archive />}
      {archived ? "Reactivate" : "Archive"}
    </Button>
  );
}
