"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";

const LABELS: Record<string, string> = {
  name: "name",
  category: "category",
  address: "address",
  neighborhood: "neighbourhood",
  district: "district",
  city: "city",
  mapsUrl: "maps link",
  phone: "phone",
  businessStatus: "business status",
  rating: "rating",
  reviewCount: "reviews",
  priceLevel: "price level",
  website: "website",
  pageTitle: "page title",
  metaDescription: "meta description",
  h1: "H1",
  httpsOk: "HTTPS",
  mobileFriendly: "mobile-friendly",
  whatsappCta: "WhatsApp CTA",
  phoneCta: "click-to-call",
  bookingCta: "booking CTA",
};

/**
 * Shows which columns the operator owns. Google refreshes everything else;
 * these stay untouched until they are explicitly released.
 */
export function ManualFieldsBar({ leadId, manualFields }: { leadId: string; manualFields: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!manualFields.length) return null;

  async function release(fields?: string[]) {
    setBusy(true);
    const res = await fetch(`/api/leads/${leadId}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fields ? { fields } : {}),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error("Could not release the field");
      return;
    }
    toast.success(fields ? `${LABELS[fields[0]] ?? fields[0]} released to Google` : "All fields released to Google");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5">
      <Lock className="size-3 shrink-0 text-primary" />
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Your values, kept from Google</span>
      {manualFields.map((f) => (
        <button
          key={f}
          disabled={busy}
          onClick={() => void release([f])}
          title="Release this field so Google can refresh it again"
          className="group inline-flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary hover:bg-primary/25"
        >
          {LABELS[f] ?? f}
          <Unlock className="size-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      ))}
      <Button size="xs" variant="ghost" className="ml-auto h-6" disabled={busy} onClick={() => void release()}>
        Release all
      </Button>
    </div>
  );
}
