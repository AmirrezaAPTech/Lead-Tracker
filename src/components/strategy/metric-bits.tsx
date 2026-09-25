import { Badge } from "@/components/ui/badge";
import { SAMPLE_BANDS } from "@/lib/constants";
import { pct, ratio, sampleBand } from "@/lib/strategy";
import { cn } from "@/lib/utils";

/**
 * How much weight this sample deserves - practical guidance, not statistics.
 * The app never claims significance; it only stops seven contacted leads from
 * reading like a settled answer.
 */
export function SampleBadge({ contacted, className }: { contacted: number; className?: string }) {
  const band = sampleBand(contacted);
  return (
    <Badge className={cn(band.className, "tabnum", className)} title={SAMPLE_SIZE_HINT}>
      {band.label} - {contacted} contacted
    </Badge>
  );
}

export const SAMPLE_SIZE_HINT =
  `Rough guidance only, never a significance test: under ${SAMPLE_BANDS[2].min} contacted is early data, ` +
  `${SAMPLE_BANDS[2].min}-${SAMPLE_BANDS[1].min - 1} an initial signal, ` +
  `${SAMPLE_BANDS[1].min}-${SAMPLE_BANDS[0].min - 1} a useful comparison, ` +
  `${SAMPLE_BANDS[0].min}+ a strong sample.`;

/** A raw count. The number itself is always the headline, never a rate. */
export function Metric({
  label,
  value,
  accent,
  className,
}: {
  label: string;
  value: React.ReactNode;
  accent?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-md border border-border/60 px-2.5 py-1.5", className)}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("tabnum text-lg font-semibold leading-tight", accent)}>{value}</div>
    </div>
  );
}

/**
 * A conversion rate with the counts that produced it kept in view, so "20%"
 * can never be read without seeing that it came from 2 replies out of 10.
 */
export function Rate({
  label,
  numerator,
  denominator,
  className,
}: {
  label: string;
  numerator: number;
  denominator: number;
  className?: string;
}) {
  const value = ratio(numerator, denominator);
  return (
    <div className={cn("flex items-baseline justify-between gap-3 border-b border-border/40 py-1 last:border-0", className)}>
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="tabnum text-xs">
        <span className="text-muted-foreground">
          {numerator} / {denominator}
        </span>
        <span className={cn("ml-2 font-semibold", value === null && "text-muted-foreground")}>{pct(value)}</span>
      </span>
    </div>
  );
}

/** A rate as a bar, only where the comparison is easier to read that way. */
export function RateBar({ value, className }: { value: number | null; className?: string }) {
  return (
    <span className={cn("block h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <span
        className="block h-full rounded-full bg-primary/70"
        style={{ width: `${Math.round(Math.min(1, value ?? 0) * 100)}%` }}
      />
    </span>
  );
}
