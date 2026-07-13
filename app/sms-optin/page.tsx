"use client";

import { useState } from "react";
import { LogoMark, SheenButton } from "@/components/Brand";

// Public opt-in page for Scout's SMS channel (Twilio toll-free registration
// requires a live, publicly reachable page demonstrating the consent flow —
// phone field, an unchecked consent checkbox, frequency/rate disclosure,
// HELP/STOP instructions, and links to Terms/Privacy). Scout's actual SMS
// use is a single account owner's number (TWILIO_OWNER_PHONE_NUMBER, set at
// deploy time) receiving floor-run summaries and approval requests — this
// form is the compliance-facing opt-in artifact for that number, not a
// general subscriber signup backed by its own database.

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  const part1 = digits.slice(0, 3);
  const part2 = digits.slice(3, 6);
  const part3 = digits.slice(6, 10);
  if (digits.length > 6) return `(${part1}) ${part2}-${part3}`;
  if (digits.length > 3) return `(${part1}) ${part2}`;
  if (digits.length > 0) return `(${part1}`;
  return "";
}

export default function SmsOptInPage() {
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    if (!consent) {
      setError("Check the box to confirm you'd like to receive texts.");
      return;
    }
    setError(null);
    setSubmitted(true);
  }

  return (
    <div className="flex min-h-screen flex-col bg-white text-black">
      <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 bg-black/10">
        <div className="flex items-center gap-3 bg-white px-6 py-4 md:px-10">
          <LogoMark />
          <span className="font-display text-lg font-bold tracking-tight">scout.</span>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[560px] flex-1 px-6 py-16 md:px-0">
        <label className="mb-2 block font-display text-[10px] uppercase tracking-[0.25em] text-black/45">
          SMS alerts
        </label>
        <h1 className="mb-3 font-display text-2xl font-bold tracking-tight">Scout Text Alert Subscription</h1>
        <p className="mb-8 text-sm leading-relaxed text-black/60">
          Get a text when your Scout floor finishes a run, and when an account needs your approval before outreach
          goes out.
        </p>

        {submitted ? (
          <div className="border border-black/15 px-5 py-4 text-sm" style={{ animation: "fadeIn 0.3s ease-out" }}>
            <span className="font-display text-xs uppercase tracking-wide">Thanks — you&apos;re on the list.</span>
            <p className="mt-2 text-black/60">We&apos;ll text {phone} when there&apos;s something worth your attention.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="phone" className="mb-2 block text-sm font-medium">
                Mobile Phone Number*
              </label>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                placeholder="(555) 123-4567"
                className="w-full border border-black/15 bg-black/[0.02] px-4 py-2.5 text-sm outline-none transition-colors focus:border-black"
              />
            </div>

            <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-black/70">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 border-black/30"
              />
              <span>
                Yes, I would like to receive automated text messages from Scout about floor run summaries and
                outreach approval requests. I understand message frequency varies with usage — typically a few
                messages per day while the floor is active.
              </span>
            </label>

            <div className="space-y-1 text-xs leading-relaxed text-black/45">
              <p>
                <strong className="text-black/60">Standard Rates:</strong> Message and data rates may apply
                depending on your mobile service plan.
              </p>
              <p>
                <strong className="text-black/60">Help &amp; Stop:</strong> Reply HELP for help or STOP to cancel at
                any time.
              </p>
              <p>
                By providing your phone number and checking the box above, you agree to receive text messages from
                Scout. Consent is not required to use the product. See our{" "}
                <a href="/terms" className="underline hover:text-black">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a href="/privacy" className="underline hover:text-black">
                  Privacy Policy
                </a>
                .
              </p>
            </div>

            {error && <p className="text-xs text-black/70">{error}</p>}

            <SheenButton
              type="submit"
              className="w-full bg-black px-6 py-3 font-display text-xs uppercase tracking-[0.2em] text-white"
              sheenClassName="bg-white/25"
            >
              Yes, sign me up!
            </SheenButton>
          </form>
        )}
      </div>
    </div>
  );
}
