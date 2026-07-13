import { LogoMark } from "@/components/Brand";

export const metadata = { title: "Terms of Service — Scout" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-black/10 py-6 first:border-t-0 first:pt-0">
      <h2 className="mb-2 font-display text-xs uppercase tracking-[0.2em] text-black/45">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-black/70">{children}</div>
    </section>
  );
}

export default function TermsPage() {
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
        <h1 className="mb-8 font-display text-2xl font-bold tracking-tight">Terms of Service</h1>

        <Section title="What Scout is">
          <p>
            Scout is an AI-assisted sales development tool. It researches accounts, drafts outreach off a cited
            reason to reach out, and routes drafts to a human for approval before anything is sent. Scout does not
            send outreach on your behalf without your review at the approval boundaries the product defines.
          </p>
        </Section>

        <Section title="Your responsibilities">
          <p>
            You&apos;re responsible for the outreach you approve and send using Scout, for complying with applicable
            marketing, spam, and data-protection laws in your jurisdiction, and for the accuracy of any company or
            contact information you provide.
          </p>
        </Section>

        <Section title="SMS &amp; notifications">
          <p>
            If you opt in to text alerts, Scout will message the phone number you provide about floor run summaries
            and approval requests. Message frequency varies with usage. Message and data rates may apply. Reply HELP
            for help or STOP at any time to stop receiving messages.
          </p>
        </Section>

        <Section title="No warranty">
          <p>
            Scout is provided &ldquo;as is.&rdquo; Signals, drafts, and account data are generated from third-party
            web sources and AI models and may be incomplete or inaccurate. Review everything before you act on it.
          </p>
        </Section>

        <Section title="Changes">
          <p>We may update these terms as the product evolves. Continued use after an update means you accept it.</p>
        </Section>

        <Section title="Contact">
          <p>Questions about these terms — reach out to the team running your Scout instance.</p>
        </Section>
      </div>
    </div>
  );
}
