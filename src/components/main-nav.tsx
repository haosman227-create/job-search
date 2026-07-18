"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Today" },
  { href: "/catalog", label: "Catalog" },
  { href: "/invoices", label: "Invoices" },
  { href: "/settings", label: "Settings" },
] as const;

export function MainNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 text-sm">
      {links.map(({ href, label }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "rounded-full px-3.5 py-1.5 transition-colors hover:bg-accent hover:text-accent-foreground",
              active
                ? "bg-primary/15 font-medium text-primary"
                : "text-muted-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
