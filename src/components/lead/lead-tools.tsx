"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Gauge, RefreshCw, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GenerateSiteDialog } from "./generate-site-dialog";

/** Website check, Google enrichment and site generation. All explicit, one lead at a time. */
export function LeadTools({
  leadId,
  leadName,
  hasWebsite,
  demoUrl,
}: {
  leadId: string;
  leadName: string;
  hasWebsite: boolean;
  demoUrl?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function call(path: string, label: string) {
    setBusy(path);
    const res = await fetch(`/api/leads/${leadId}/${path}`, { method: "POST" });
    setBusy(null);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? `${label} failed`);
      return;
    }
    toast.success(data.cached ? `${label}: using cached Google data` : `${label} done`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      <Button size="xs" variant="outline" disabled={!hasWebsite || busy !== null} onClick={() => void call("website", "Website check")}>
        {busy === "website" ? <RefreshCw className="animate-spin" /> : <Gauge />} Analyse website
      </Button>
      <Button size="xs" variant="outline" disabled={busy !== null} onClick={() => void call("enrich", "Enrich")}>
        {busy === "enrich" ? <RefreshCw className="animate-spin" /> : <Download />} Enrich from Google
      </Button>
      <GenerateSiteDialog leadId={leadId} leadName={leadName} hasSite={Boolean(demoUrl)} />
    </div>
  );
}
