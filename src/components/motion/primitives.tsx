"use client";

import { useEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useReducedMotion,
  type Variants,
} from "motion/react";

/**
 * Calm-futurism motion primitives (SPEC-V2 §3). Every effect < 400ms,
 * communicates state, and collapses to instant when the user prefers reduced
 * motion. These are the ONLY animation entry points — pages compose them.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

export function FadeUp({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.38, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const staggerChild: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.34, ease: EASE } },
};

/** Children wrapped in <StaggerItem> enter one after another. */
export function Stagger({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={staggerParent}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={staggerChild}>
      {children}
    </motion.div>
  );
}

/**
 * A number that counts up to its value on first view. `format` turns the
 * animated value into the display string (e.g. formatCents) so money stays
 * integer at the edges — the float only ever exists inside the tween.
 */
export function CountUp({
  value,
  format,
  className,
  durationMs = 900,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
  durationMs?: number;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (reduced || done) return;
    const node = ref.current;
    if (!node) return;
    const controls = animate(0, value, {
      duration: durationMs / 1000,
      ease: EASE,
      onUpdate: (latest) => {
        node.textContent = format(Math.round(latest));
      },
      onComplete: () => setDone(true),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduced]);

  return (
    <span ref={ref} className={className}>
      {reduced || done ? format(value) : format(0)}
    </span>
  );
}
