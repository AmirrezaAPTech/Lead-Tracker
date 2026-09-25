import Link from "next/link";
import type { LeadStatus, LeadTier } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { STATUS_CLASS, STATUS_LABEL, TIER_CLASS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ScoreReason } from "@/lib/scoring";

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-border bg-background/95 px-6 py-3 backdrop-blur">
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold">{title}</h1>
        {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

export function StatusBadge({ status, className }: { status: LeadStatus; className?: string }) {
  return <Badge className={cn(STATUS_CLASS[status], className)}>{STATUS_LABEL[status]}</Badge>;
}

export function TierBadge({ tier, score, className }: { tier: LeadTier; score?: number; className?: string }) {
  return (
    <Badge className={cn(TIER_CLASS[tier], "tabnum", className)}>
      {score !== undefined ? `${score} ` : ""}
      {tier}
    </Badge>
  );
}

export function Stat({
  label,
  value,
  href,
  hint,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  href?: string;
  hint?: string;
  accent?: string;
}) {
  const body = (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/40">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("tabnum mt-0.5 text-xl font-semibold", accent)}>{value}</div>
      {hint ? <div className="text-[10px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function ScoreReasons({ reasons, className }: { reasons: unknown; className?: string }) {
  const list = (Array.isArray(reasons) ? reasons : []) as ScoreReason[];
  if (!list.length) return <span className="text-xs text-muted-foreground">No scoring signals yet.</span>;
  return (
    <ul className={cn("space-y-0.5", className)}>
      {list.map((r, i) => (
        <li key={i} className="flex items-baseline gap-1.5 text-xs text-muted-foreground">
          <span className="tabnum shrink-0 font-semibold text-emerald-400">+{r.points}</span>
          <span className="truncate">{r.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function WebsiteChip({
  hasWebsite,
  websiteScore,
  issues,
}: {
  hasWebsite: boolean;
  websiteScore?: number | null;
  issues?: string[];
}) {
  if (!hasWebsite) {
    return <Badge className="border-red-500/30 bg-red-500/15 text-red-300">No website</Badge>;
  }
  if (websiteScore === null || websiteScore === undefined) {
    return <Badge className="border-zinc-500/30 bg-zinc-500/15 text-zinc-400">Site not checked</Badge>;
  }
  const cls =
    websiteScore < 50
      ? "border-amber-500/30 bg-amber-500/15 text-amber-300"
      : websiteScore < 80
        ? "border-sky-500/30 bg-sky-500/15 text-sky-300"
        : "border-emerald-500/30 bg-emerald-500/15 text-emerald-300";
  return (
    <Badge className={cn(cls, "tabnum")}>
      Site {websiteScore}
      {issues?.length ? ` / ${issues.length} issues` : ""}
    </Badge>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="mt-1 max-w-md text-xs text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
