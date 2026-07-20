import { formatCents } from "@/lib/domain";

/**
 * A faithful, static mock of the "Today" dashboard for the hero — the single
 * most important thing a premium landing page has: a picture of the product.
 * Built from the real surfaces/tokens so it reads as the actual app.
 */
export function ProductPreview() {
  const stats = [
    { label: "Spend this month", value: formatCents(842900), tone: "ink" },
    { label: "Avg margin", value: "68%", tone: "green" },
    { label: "Margin at risk", value: "2", tone: "ember" },
    { label: "Costs went up", value: "3", tone: "ember" },
  ] as const;

  const insights = [
    { pct: "+14%", good: false, text: "Mozzarella up 14% — $58.80/mo more at recent volume" },
    { pct: "-9%", good: true, text: "Roma tomatoes down 9% — $22/mo back in your pocket" },
    { pct: "+21%", good: false, text: "Olive oil margin squeezed to 12% — reprice or renegotiate" },
  ];

  return (
    <div className="surface w-full rounded-[1.6rem] p-3 shadow-[var(--shadow-lift)]">
      <div className="rounded-[1.2rem] bg-background/60 p-4 sm:p-6">
        {/* Window chrome */}
        <div className="mb-5 flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-destructive/60" />
          <span className="size-2.5 rounded-full bg-chart-3/70" />
          <span className="size-2.5 rounded-full bg-positive/70" />
          <span className="ml-3 text-xs text-muted-foreground">Today</span>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="surface rounded-xl p-3.5">
              <p className="text-[0.68rem] font-medium tracking-wide text-muted-foreground uppercase">
                {s.label}
              </p>
              <p
                className={`mt-1.5 text-xl font-semibold tracking-tight tabular sm:text-2xl ${
                  s.tone === "green"
                    ? "text-positive"
                    : s.tone === "ember"
                      ? "text-primary"
                      : "text-foreground"
                }`}
              >
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* Price watch */}
        <p className="mt-6 mb-2 text-sm font-medium">Price watch</p>
        <div className="flex flex-col gap-2">
          {insights.map((i) => (
            <div
              key={i.text}
              className={`surface flex items-center gap-3 rounded-xl border-l-2 p-3 ${
                i.good ? "border-l-positive" : "border-l-primary"
              }`}
            >
              <span
                className={`tabular shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                  i.good
                    ? "bg-positive/12 text-positive"
                    : "bg-primary/12 text-primary"
                }`}
              >
                {i.pct}
              </span>
              <span className="text-[0.82rem] text-foreground/90">{i.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
