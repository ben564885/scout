import { LogoMark } from "@/components/Brand";

export const metadata = { title: "Privacy Policy — Scout" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-black/10 py-6 first:border-t-0 first:pt-0">
      <h2 className="mb-2 font-display text-xs uppercase tracking-[0.2em] text-black/45">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-black/70">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-black">
      <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 bg-black/10">
        <div className="flex items-center gap-3 bg-white px-6 py-4 md:px-10">
          <LogoMark />
          <span className="font-display text-lg font-bold tracking-tight">scout.</span>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[720px] flex-1 px-6 py-16 md:px-0">
        <label className="mb-2 block font-display text-[10px] uppercase tracking-[0.25em] text-black/45">
          Legal
        </label>
        <h1 className="mb-8 font-display text-2xl font-bold tracking-tight">Privacy Policy</h1>

        <Section title="What we collect">
          <p>
            Account and signal data Scout gathers on your behalf (business names, locations, public review/listing
            data, and the citations behind them), the outreach drafts and approval decisions you make, and — if you
            opt in — the mobile phone number used for text alerts.
          </p>
        </Section>

        <Section title="How we use it">
          <p>
            To run the product: building account lists, researching a &ldquo;why now&rdquo; signal, drafting
            outreach, and notifying you (by text and/or email) when a run finishes or needs your approval. We don&apos;t
            sell your data or the phone number you provide for SMS alerts, and we don&apos;t use it for marketing
            unrelated to Scout itself.
          </p>
        </Section>

        <Section title="Third parties">
          <p>
            Scout pulls public web data and AI-generated research through third-party providers (web data and search
            APIs, a model gateway) to build signals and drafts, and uses a messaging provider to deliver SMS/email
            notifications. These providers process the minimum data needed to perform that specific task.
          </p>
        </Section>

        <Section title="SMS data">
          <p>
            Phone numbers collected for text alerts are used only to send the notifications you opted into — floor
            run summaries and approval requests. Reply STOP at any time to opt out; we&apos;ll stop texting that
            number immediately. Reply HELP for support.
          </p>
        </Section>

        <Section title="Retention &amp; access">
          <p>
            Data persists for as long as your Scout instance is in use. You can request deletion of your account
            data or opt-out phone number at any time.
          </p>
        </Section>

        <Section title="Contact">
          <p>Questions about this policy — reach out to the team running your Scout instance.</p>
        </Section>
      </div>
    </div>
  );
}
