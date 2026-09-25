"use client";

import { toast } from "sonner";
import { Copy, Globe, Instagram, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, ensureUrl, telHref, waHref } from "@/lib/utils";

export type QuickActionLead = {
  name: string;
  mapsUrl?: string | null;
  website?: string | null;
  instagramUrl?: string | null;
  instagramUsername?: string | null;
  phone?: string | null;
  email?: string | null;
};

export async function copyText(text: string, label = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label}`);
  } catch {
    toast.error("Could not copy");
  }
}

export function CopyButton({
  value,
  label,
  className,
  children,
}: {
  value: string;
  label?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className={cn("text-muted-foreground", className)}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        void copyText(value, label ?? "Copied");
      }}
    >
      <Copy />
      {children}
    </Button>
  );
}

function ActionLink({
  href,
  title,
  disabled,
  children,
}: {
  href?: string | null;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  if (!href || disabled) {
    return (
      <Button variant="outline" size="xs" disabled title={`${title} (not available)`}>
        {children}
      </Button>
    );
  }
  return (
    <Button variant="outline" size="xs" asChild title={title}>
      <a href={href} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}>
        {children}
      </a>
    </Button>
  );
}

/** One-click row: maps, site, instagram, call, whatsapp, email, copy. */
export function QuickActions({
  lead,
  compact = false,
  className,
}: {
  lead: QuickActionLead;
  compact?: boolean;
  className?: string;
}) {
  const instagram =
    lead.instagramUrl ?? (lead.instagramUsername ? `https://instagram.com/${lead.instagramUsername}` : null);

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <ActionLink href={lead.mapsUrl} title="Open Google Maps">
        <MapPin />
        {compact ? null : "Maps"}
      </ActionLink>
      <ActionLink href={ensureUrl(lead.website)} title="Open website">
        <Globe />
        {compact ? null : "Site"}
      </ActionLink>
      <ActionLink href={instagram} title="Open Instagram">
        <Instagram />
        {compact ? null : "IG"}
      </ActionLink>
      <ActionLink href={telHref(lead.phone)} title="Call">
        <Phone />
        {compact ? null : "Call"}
      </ActionLink>
      <ActionLink href={waHref(lead.phone)} title="Open WhatsApp chat">
        <MessageCircle />
        {compact ? null : "WhatsApp"}
      </ActionLink>
      <ActionLink href={lead.email ? `mailto:${lead.email}` : null} title="Email">
        <Mail />
        {compact ? null : "Email"}
      </ActionLink>
      {lead.phone ? <CopyButton value={lead.phone} label="Phone copied">{compact ? null : "Phone"}</CopyButton> : null}
      {instagram ? (
        <CopyButton value={lead.instagramUsername ?? instagram} label="Instagram copied">
          {compact ? null : "IG handle"}
        </CopyButton>
      ) : null}
    </div>
  );
}
