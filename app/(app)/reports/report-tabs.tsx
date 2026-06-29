"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

const tabs = [
  { name: "Daily", href: "/reports" },
  { name: "Weekly", href: "/reports/weekly" },
  { name: "Monthly", href: "/reports/monthly" },
];

export function ReportTabs({ active }: { active: string }) {
  return (
    <nav className="flex gap-2 border-b">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
            active === tab.name.toLowerCase()
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.name}
        </Link>
      ))}
    </nav>
  );
}
