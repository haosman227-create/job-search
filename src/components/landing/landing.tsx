"use client";

import Link from "next/link";
import { formatCents } from "@/lib/domain";
import { CountUp, FadeUp, Stagger, StaggerItem } from "@/components/motion/primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The public front door (SPEC-V2): sell against MarginEdge in as few words as
 * possible. Numbers demo themselves; copy stays out of the way.
 */

const COMPARISON: { label: string; us: string; them: string }[] = [
  { label: "Invoice processed in", us: "Seconds", them: "24–48 hours" },
  { label: "Starting price", us: "$29/mo", them: "~$330/mo per location" },
  { label: "Get started", us: "Free trial, no card", them: "Book a demo" },
  { label: "Price-spike alerts", us: "Built in", them: "Dig through reports" },
];

const TIERS = [
  { name: "Starter", price: 2900, blurb: "Single small spot", invoices: "50 invoices/mo" },
  { name: "Growth", price: 7900, blurb: "Busy kitchen", invoices: "250 invoices/mo", featured: true },
  { name: "Pro", price: 19900, blurb: "High volume / multi-location", invoices: "1,000 invoices/mo" },
];

export function Landing() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-24 px-5 pt-6 pb-20">
      {/* Header */}
      <header className="glass sticky top-4 z-10 flex items-center justify-between rounded-2xl px-5 py-3">
        <span className="text-lg font-semibold tracking-tight">
          Margin<span className="text-primary">.</span>
        </span>
        <nav className="flex items-center gap-2">
          <Button render={<Link href="/login" />} variant="ghost" size="sm">
            Sign in
          </Button>
          <Button render={<Link href="/signup" />} size="sm">
            Start free
          </Button>
        </nav>
      </header>

      {/* Hero */}
      <section className="flex flex-col items-center gap-8 text-center">
        <FadeUp>
          <h1 className="max-w-3xl text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-6xl">
            Your invoice becomes your food cost —{" "}
            <span className="glow text-primary">in seconds</span>, not days.
          </h1>
        </FadeUp>
        <FadeUp delay={0.08}>
          <p className="max-w-xl text-lg text-muted-foreground">
            Snap it. AI reads every line. Your margins update themselves.
          </p>
        </FadeUp>
        <FadeUp delay={0.14} className="flex items-center gap-3">
          <Button render={<Link href="/signup" />} size="lg">
            Start free — no card
          </Button>
          <Button render={<a href="#pricing" />} variant="outline" size="lg">
            Pricing
          </Button>
        </FadeUp>

        {/* Live-feel demo numbers */}
        <Stagger className="mt-4 grid w-full grid-cols-3 gap-3 sm:gap-4">
          {[
            { label: "Invoice read in", value: 7, format: (n: number) => `${n}s` },
            { label: "Lines captured", value: 34, format: String },
            { label: "Margin protected", value: 31284, format: formatCents },
          ].map((s) => (
            <StaggerItem key={s.label} className="glass rounded-2xl p-4 sm:p-6">
              <p className="glow text-2xl font-semibold tabular text-primary sm:text-4xl">
                <CountUp value={s.value} format={s.format} />
              </p>
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                {s.label}
              </p>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Comparison */}
      <section className="flex flex-col gap-6">
        <FadeUp>
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            Built to retire the old way
          </h2>
        </FadeUp>
        <Stagger className="flex flex-col gap-2">
          <StaggerItem className="grid grid-cols-3 gap-2 px-4 text-xs tracking-wide text-muted-foreground uppercase">
            <span />
            <span className="text-primary">Margin</span>
            <span>Legacy tools</span>
          </StaggerItem>
          {COMPARISON.map((row) => (
            <StaggerItem
              key={row.label}
              className="glass grid grid-cols-3 items-center gap-2 rounded-xl px-4 py-3 text-sm sm:text-base"
            >
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-medium text-primary">{row.us}</span>
              <span className="text-muted-foreground">{row.them}</span>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Pricing */}
      <section id="pricing" className="flex flex-col gap-6">
        <FadeUp>
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            Simple pricing
          </h2>
          <p className="mt-2 text-center text-muted-foreground">
            14 days free on every plan. No card to start.
          </p>
        </FadeUp>
        <Stagger className="grid gap-4 sm:grid-cols-3">
          {TIERS.map((tier) => (
            <StaggerItem
              key={tier.name}
              className={cn(
                "glass flex flex-col gap-3 rounded-2xl p-6",
                tier.featured && "border-primary/50",
              )}
            >
              <p className="font-medium">{tier.name}</p>
              <p className="text-3xl font-semibold tabular tracking-tight">
                {formatCents(tier.price)}
                <span className="text-sm font-normal text-muted-foreground">
                  /mo
                </span>
              </p>
              <p className="text-sm text-muted-foreground">{tier.blurb}</p>
              <p className="text-sm text-muted-foreground">{tier.invoices}</p>
              <Button
                render={<Link href="/signup" />}
                variant={tier.featured ? "default" : "outline"}
                className="mt-auto"
              >
                Start free
              </Button>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Footer */}
      <footer className="flex items-center justify-between border-t border-border pt-6 text-sm text-muted-foreground">
        <span>
          Margin<span className="text-primary">.</span>
        </span>
        <nav className="flex gap-4">
          <Link href="/legal/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link href="/legal/privacy" className="hover:text-foreground">
            Privacy
          </Link>
        </nav>
      </footer>
    </div>
  );
}
