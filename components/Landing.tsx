"use client";

import { useEffect, useRef, useState } from "react";
import { ProblemIllustration } from "./landing/IsoArt";

const NAV_LINKS = ["Problem", "Product", "Pricing", "About", "Contact"];

const TRUSTED_BY = ["northpoint", "VANTAGE", "brightline", "ANCHOR", "Loop&Co"];

const PROBLEM_CARDS: {
  variant: "converge" | "stack" | "bounce" | "gate";
  title: string;
  body: string;
}[] = [
  {
    variant: "converge",
    title: "Signal Blind Spots",
    body: "Reviews, hiring surges, and local news bury the buying signals that matter.",
  },
  {
    variant: "stack",
    title: "Manual Research Drag",
    body: "Reps burn hours qualifying a single account before writing one email.",
  },
  {
    variant: "bounce",
    title: "Generic Outreach",
    body: "Templated sequences get ignored because they ignore what's actually happening at the account.",
  },
  {
    variant: "gate",
    title: "No Guardrails At Scale",
    body: "Automating outreach without oversight turns one bad send into a brand problem.",
  },
];

function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0">
      <rect width="32" height="32" fill="black" />
      <rect x="4" y="4" width="10" height="10" fill="white" />
      <rect x="18" y="18" width="10" height="10" fill="white" />
    </svg>
  );
}

// Small scanning-dot accent — reads as "Scout is watching" rather than a
// static glyph, echoing the product's always-on signal detection.
function ScanDots() {
  return (
    <span className="mb-6 flex gap-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-black/40"
          style={{ animation: `pulseDot 1.4s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
    </span>
  );
}

function NavLink({ label }: { label: string }) {
  return (
    <a href={`#${label.toLowerCase()}`} className="group relative pb-1 hover:text-black">
      {label}
      <span className="absolute inset-x-0 -bottom-0.5 h-px origin-left scale-x-0 bg-black transition-transform duration-300 ease-out group-hover:scale-x-100" />
    </a>
  );
}

function SheenLink({
  href,
  className,
  sheenClassName,
  children,
}: {
  href: string;
  className: string;
  sheenClassName: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} className={`group relative overflow-hidden transition-transform hover:scale-[1.02] ${className}`}>
      <span className="relative z-10">{children}</span>
      <span
        className={`pointer-events-none absolute inset-0 -translate-x-full skew-x-[-15deg] transition-transform duration-700 ease-out group-hover:translate-x-[220%] ${sheenClassName}`}
      />
    </a>
  );
}

// Fades a card up once it enters the viewport, and only then "reveals" its
// isometric illustration so the scene's poles/lines/dust play their entrance
// beats in sync with the card itself instead of firing off-screen.
function ProblemCard({
  variant,
  title,
  body,
}: {
  variant: "converge" | "stack" | "bounce" | "gate";
  title: string;
  body: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        inView ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
    >
      <div className="aspect-[4/3] border border-black/10 bg-neutral-50">
        <ProblemIllustration variant={variant} revealed={inView} />
      </div>
      <h3 className="mt-5 font-display text-sm font-bold uppercase tracking-wide">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-black/50">{body}</p>
    </div>
  );
}

export default function Landing() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="overflow-x-hidden bg-white text-black">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-px bg-black/10 md:grid-cols-2">
        {/* Nav — left */}
        <div className="flex items-center gap-3 bg-white px-6 py-4 md:px-10">
          <LogoMark />
          <span className="font-display text-lg font-bold tracking-tight">scout.</span>
        </div>

        {/* Nav — right */}
        <div className="flex items-center justify-between gap-6 bg-white px-6 py-4 md:px-10">
          <nav className="hidden items-center gap-7 font-display text-xs uppercase tracking-wide text-black/60 lg:flex">
            {NAV_LINKS.map((link) => (
              <NavLink key={link} label={link} />
            ))}
          </nav>
          <a
            href="/dashboard"
            className="ml-auto border border-black px-4 py-2 font-display text-xs uppercase tracking-wide transition-colors hover:bg-black hover:text-white lg:ml-0"
          >
            Login / Sign in
          </a>
        </div>

        {/* Hero — left */}
        <div className="flex flex-col items-center bg-white px-8 py-16 text-center md:px-16">
          <div className={mounted ? "contents [&>*]:animate-[fadeUp_0.7s_cubic-bezier(0.16,1,0.3,1)_both]" : "contents [&>*]:opacity-0"}>
            <ScanDots />
            <h1
              style={{ animationDelay: "0.05s" }}
              className="font-display text-4xl font-bold uppercase leading-[1.15] tracking-tight md:text-5xl"
            >
              The Evolution
            </h1>
            <p style={{ animationDelay: "0.15s" }} className="font-accent -mt-1 text-4xl italic text-black/80 md:text-5xl">
              of the SDR
            </p>
            <h1
              style={{ animationDelay: "0.25s" }}
              className="font-display text-4xl font-bold uppercase leading-[1.15] tracking-tight md:text-5xl"
            >
              Workforce
            </h1>
            <p style={{ animationDelay: "0.35s" }} className="mt-6 max-w-sm text-sm leading-relaxed text-black/55">
              Scout finds the buying signals hiding in reviews, hiring pages, and local news, then
              drafts outreach that a compliance layer approves before it ever reaches a prospect.
            </p>
            <div style={{ animationDelay: "0.45s" }}>
              <SheenLink
                href="/dashboard"
                className="mt-8 inline-block bg-[#0b1220] px-8 py-3 font-display text-xs uppercase tracking-[0.2em] text-white"
                sheenClassName="bg-white/25"
              >
                Start Free Trial
              </SheenLink>
            </div>
            <div style={{ animationDelay: "0.55s" }} className="mt-16 w-full border-t border-black/10 pt-8">
              <p className="font-display text-[10px] uppercase tracking-[0.25em] text-black/35">
                Trusted by revenue teams globally
              </p>
              <div className="marquee-wrap mt-5 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)] [-webkit-mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
                <div className="marquee-track flex w-max items-center gap-10 text-black/30">
                  {[...TRUSTED_BY, ...TRUSTED_BY].map((name, i) => (
                    <span key={i} className="font-accent whitespace-nowrap text-xl italic">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Hero — right (photo panel) */}
        <div
          className="min-h-[520px] bg-cover bg-center"
          style={{ backgroundImage: "url(/cloudBg.jpg)" }}
        />
      </div>

      {/* The Problem bar */}
      <div className="mx-auto flex max-w-[1400px] items-center justify-between border-y border-black/10 px-6 py-4 md:px-10">
        <span className="h-2 w-2 bg-black" />
        <span className="font-display text-xs uppercase tracking-[0.35em] text-black/45">The Problem</span>
        <span className="h-2 w-2 bg-black" />
      </div>

      {/* Problem section */}
      <section id="problem" className="mx-auto max-w-[1400px] px-6 py-20 md:px-10">
        <h2 className="mx-auto max-w-3xl text-center font-display text-3xl font-bold uppercase leading-snug md:text-4xl">
          Pipeline Is Growing Faster
          <br />
          Than Your Reps Can Cover It
        </h2>

        <div className="mt-16 grid gap-x-10 gap-y-14 md:grid-cols-2">
          {PROBLEM_CARDS.map((card) => (
            <ProblemCard key={card.title} {...card} />
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-black/10 bg-[#0b1220] px-6 py-20 text-center text-white md:px-10">
        <h2 className="mx-auto max-w-2xl font-display text-3xl font-bold uppercase leading-snug md:text-4xl">
          Put an SDR workforce on the clock tonight
        </h2>
        <p className="mx-auto mt-4 max-w-md text-sm text-white/55">
          Every draft is logged, every veto is explainable, every send is approved before it goes
          out.
        </p>
        <SheenLink
          href="/dashboard"
          className="mt-8 inline-block bg-white px-8 py-3 font-display text-xs uppercase tracking-[0.2em] text-black"
          sheenClassName="bg-black/10"
        >
          Start Free Trial
        </SheenLink>
      </section>

      {/* Footer */}
      <footer className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-4 px-6 py-8 font-display text-xs uppercase tracking-wide text-black/40 md:flex-row md:px-10">
        <div className="flex items-center gap-2">
          <LogoMark />
          <span>scout.</span>
        </div>
        <span>© 2026 Scout. All rights reserved.</span>
      </footer>
    </div>
  );
}
