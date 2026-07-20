"use client";

import Link from "next/link";
import { formatCents } from "@/lib/domain";
import { FadeUp, Stagger, StaggerItem } from "@/components/motion/primitives";
import { ProductPreview } from "@/components/landing/product-preview";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The public front door (SPEC-V2, warm-premium rev). Leads with a picture of
 * the product, sells against the slow/expensive incumbent in as few words as
 * possible, and closes on simple honest pricing.
 */

const STEPS = [
  {
    n: "1",
    title: "Snap the invoice",
    body: "Photograph any supplier invoice from your phone — or drop a PDF.",
  },
  {
    n: "2",
    title: "AI reads every line",
    body: "Line items, costs, and quantities are extracted in seconds. You confirm.",
  },
  {
    n: "3",
    title: "Margins update themselves",
    body: "Your catalog, plate costs, and price alerts stay live automatically.",
  },
];

const COMPARISON: { label: string; us: string; them: string }[] = [
  { label: "Invoice processed in", us: "Seconds", them: "24–48 hours" },
  { label: "Starting price", us: "$19/mo", them: "~$330/mo per location" },
  { label: "Get started", us: "Free trial, no card", them: "Book a sales demo" },
  { label: "Price-spike alerts", us: "Pushed to you", them: "Buried in reports" },
  { label: "Menu plate costing", us: "Auto re-costs", them: "Manual upkeep" },
];

const TIERS = [
  { name: "Starter", price: 1900, blurb: "A single small spot", invoices: "50 invoices / mo", seats: "2 seats" },
  { name: "Growth", price: 4900, blurb: "A busy kitchen", invoices: "250 invoices / mo", seats: "8 seats", featured: true },
  { name: "Pro", price: 9900, blurb: "High volume / multi-location", invoices: "1,000 invoices / mo", seats: "Unlimited seats" },
];

export function Landing() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-28 px-5 pb-24">
      {/* Header */}
      <header className="glass sticky top-4 z-20 mt-4 flex items-center justify-between rounded-full px-5 py-2.5">
        <span className="text-lg font-semibold tracking-tight">
          Margin<span className="text-primary">.</span>
        </span>
        <nav className="flex items-center gap-1.5">
          <a
            href="#pricing"
            className={buttonVariants({
              variant: "ghost",
              size: "sm",
              className: "hidden sm:inline-flex",
            })}
          >
            Pricing
          </a>
          <Link
            href="/login"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Sign in
          </Link>
          <Link href="/signup" className={buttonVariants({ size: "sm" })}>
            Start free
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="flex flex-col items-center gap-10 pt-6 text-center">
        <FadeUp className="flex flex-col items-center gap-6">
          <span className="rounded-full border border-primary/25 bg-primary/8 px-3.5 py-1 text-xs font-medium text-primary">
            For independent restaurants, cafés & bars
          </span>
          <h1 className="max-w-3xl text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
            Your invoice becomes your food cost —{" "}
            <span className="text-primary">in seconds</span>, not days.
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground text-balance">
            Snap a supplier invoice. AI reads every line. Your margins, plate
            costs, and price alerts update themselves.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Link href="/signup" className={buttonVariants({ size: "lg" })}>
              Start free — no card
            </Link>
            <a
              href="#how"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              See how it works
            </a>
          </div>
          <p className="text-sm text-muted-foreground">
            14-day free trial · no credit card · cancel anytime
          </p>
        </FadeUp>

        {/* Product picture */}
        <FadeUp delay={0.12} className="w-full max-w-4xl">
          <ProductPreview />
        </FadeUp>
      </section>

      {/* How it works */}
      <section id="how" className="flex flex-col gap-10">
        <FadeUp className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            From shoebox to dashboard in three taps
          </h2>
        </FadeUp>
        <Stagger className="grid gap-5 md:grid-cols-3">
          {STEPS.map((step) => (
            <StaggerItem key={step.n} className="surface flex flex-col gap-3 rounded-2xl p-6">
              <span className="flex size-9 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
                {step.n}
              </span>
              <h3 className="text-lg font-medium">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.body}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Feature spotlight: price intelligence */}
      <section className="grid items-center gap-10 md:grid-cols-2">
        <FadeUp className="flex flex-col gap-4">
          <span className="text-sm font-semibold tracking-wide text-primary uppercase">
            Price intelligence
          </span>
          <h2 className="text-3xl font-semibold tracking-tight">
            Know what moved — and what it costs you.
          </h2>
          <p className="text-muted-foreground">
            The old tools make you dig through reports. Margin reads the cost
            history your invoices already produce and tells you, in plain money:
            what went up, what it adds per month, and which plates it squeezes.
          </p>
        </FadeUp>
        <FadeUp delay={0.1}>
          <div className="surface flex flex-col gap-2 rounded-2xl p-5">
            {[
              { pct: "+14%", good: false, text: "Mozzarella up 14% — $58.80/mo more at recent volume" },
              { pct: "-9%", good: true, text: "Roma tomatoes down 9% — $22/mo back in your pocket" },
              { pct: "+21%", good: false, text: "Olive oil margin squeezed to 12% — reprice or renegotiate" },
            ].map((i) => (
              <div
                key={i.text}
                className={cn(
                  "surface flex items-center gap-3 rounded-xl border-l-2 p-3.5",
                  i.good ? "border-l-positive" : "border-l-primary",
                )}
              >
                <span
                  className={cn(
                    "tabular shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                    i.good ? "bg-positive/12 text-positive" : "bg-primary/12 text-primary",
                  )}
                >
                  {i.pct}
                </span>
                <span className="text-sm">{i.text}</span>
              </div>
            ))}
          </div>
        </FadeUp>
      </section>

      {/* Feature spotlight: recipe costing */}
      <section className="grid items-center gap-10 md:grid-cols-2">
        <FadeUp delay={0.1} className="order-2 md:order-1">
          <div className="surface flex flex-col gap-4 rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <span className="font-medium">Margherita pizza</span>
              <span className="rounded-full bg-positive/12 px-2.5 py-0.5 text-sm font-semibold text-positive">
                74% margin
              </span>
            </div>
            <div className="flex items-end justify-between border-t border-border pt-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Plate cost</p>
                <p className="tabular text-2xl font-semibold">{formatCents(415)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground uppercase">Menu price</p>
                <p className="tabular text-2xl font-semibold">{formatCents(1600)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Re-costs itself the moment an invoice moves an ingredient price.
            </p>
          </div>
        </FadeUp>
        <FadeUp className="order-1 flex flex-col gap-4 md:order-2">
          <span className="text-sm font-semibold tracking-wide text-primary uppercase">
            Recipe &amp; menu costing
          </span>
          <h2 className="text-3xl font-semibold tracking-tight">
            Every plate, always current.
          </h2>
          <p className="text-muted-foreground">
            Build a menu item from your catalog once. When cheese jumps 14%,
            every plate that uses it re-costs itself — no spreadsheets, no
            stale numbers, no monthly upkeep.
          </p>
        </FadeUp>
      </section>

      {/* Comparison */}
      <section className="flex flex-col gap-8">
        <FadeUp className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Built to retire the old way
          </h2>
        </FadeUp>
        <div className="surface overflow-hidden rounded-2xl">
          <div className="grid grid-cols-3 border-b border-border bg-secondary/60 px-5 py-3 text-xs font-medium tracking-wide uppercase">
            <span className="text-muted-foreground" />
            <span className="text-primary">Margin</span>
            <span className="text-muted-foreground">Legacy tools</span>
          </div>
          <Stagger>
            {COMPARISON.map((row) => (
              <StaggerItem
                key={row.label}
                className="grid grid-cols-3 items-center border-b border-border px-5 py-4 text-sm last:border-0 sm:text-base"
              >
                <span className="text-muted-foreground">{row.label}</span>
                <span className="font-medium text-foreground">{row.us}</span>
                <span className="text-muted-foreground">{row.them}</span>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="flex flex-col gap-8">
        <FadeUp className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Honest, simple pricing
          </h2>
          <p className="mt-3 text-muted-foreground">
            14 days free on every plan. No card to start. A fraction of what the
            incumbents charge.
          </p>
        </FadeUp>
        <Stagger className="grid gap-5 md:grid-cols-3">
          {TIERS.map((tier) => (
            <StaggerItem
              key={tier.name}
              className={cn(
                "surface relative flex flex-col gap-4 rounded-2xl p-6",
                tier.featured && "ring-2 ring-primary shadow-[var(--shadow-lift)]",
              )}
            >
              {tier.featured && (
                <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                  Most popular
                </span>
              )}
              <p className="font-medium">{tier.name}</p>
              <p className="text-4xl font-semibold tabular tracking-tight">
                {formatCents(tier.price)}
                <span className="text-base font-normal text-muted-foreground">/mo</span>
              </p>
              <p className="text-sm text-muted-foreground">{tier.blurb}</p>
              <ul className="flex flex-col gap-2 text-sm">
                <li className="flex items-center gap-2">
                  <Check /> {tier.invoices}
                </li>
                <li className="flex items-center gap-2">
                  <Check /> {tier.seats}
                </li>
                <li className="flex items-center gap-2">
                  <Check /> Price alerts &amp; recipe costing
                </li>
              </ul>
              <Link
                href="/signup"
                className={buttonVariants({
                  variant: tier.featured ? "default" : "outline",
                  className: "mt-auto",
                })}
              >
                Start free
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Final CTA */}
      <FadeUp>
        <section className="surface flex flex-col items-center gap-5 rounded-3xl bg-primary/6 p-10 text-center">
          <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Stop guessing your food cost.
          </h2>
          <p className="max-w-md text-muted-foreground">
            Snap your first invoice today — it&apos;s free for two weeks and
            takes under a minute.
          </p>
          <Link href="/signup" className={buttonVariants({ size: "lg" })}>
            Start your free trial
          </Link>
        </section>
      </FadeUp>

      {/* Footer */}
      <footer className="flex items-center justify-between border-t border-border pt-8 text-sm text-muted-foreground">
        <span>
          Margin<span className="text-primary">.</span>
        </span>
        <nav className="flex gap-5">
          <Link href="/legal/terms" className="hover:text-foreground">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/login" className="hover:text-foreground">Sign in</Link>
        </nav>
      </footer>
    </div>
  );
}

function Check() {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-positive/15 text-[0.6rem] font-bold text-positive">
      ✓
    </span>
  );
}
