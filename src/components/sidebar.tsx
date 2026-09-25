"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListChecks,
  Users,
  KanbanSquare,
  CalendarClock,
  Search,
  FolderKanban,
  Target,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: "review" | "followup";
};

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/review", label: "Review", icon: ListChecks, badge: "review" },
  { href: "/followups", label: "Follow-ups", icon: CalendarClock, badge: "followup" },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/discover", label: "Discover", icon: Search },
  { href: "/campaigns", label: "Campaigns", icon: FolderKanban },
  { href: "/strategies", label: "Strategies", icon: Target },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ reviewCount, followUpCount }: { reviewCount: number; followUpCount: number }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col border-r border-border bg-card/40">
      <div className="px-4 py-4">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Private</div>
        <div className="text-sm font-semibold">Lead Cockpit</div>
      </div>

      <nav className="flex-1 space-y-0.5 px-2">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const count = item.badge === "review" ? reviewCount : item.badge === "followup" ? followUpCount : 0;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              <span className="flex-1">{item.label}</span>
              {count > 0 ? (
                <span className="tabnum rounded bg-primary/20 px-1.5 text-[10px] font-semibold text-primary">
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <form action="/api/auth/logout" method="post" className="p-2">
        <button
          type="submit"
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </form>
    </aside>
  );
}
