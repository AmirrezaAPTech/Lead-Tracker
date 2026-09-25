import { cn } from "@/lib/utils";

export function Separator({ className, vertical = false }: { className?: string; vertical?: boolean }) {
  return <div className={cn(vertical ? "h-full w-px" : "h-px w-full", "bg-border", className)} />;
}
