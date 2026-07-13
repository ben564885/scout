import { createAdminClient } from "@insforge/sdk";
import { Account, Signal } from "./types";
import { CitedResearch } from "./youdotcom";
import { integrationStatus } from "./env";

// The Writer (PRD §5.1): drafts outreach off the exact signal, through the
// InsForge model gateway. Falls back to the deterministic template below when
// the gateway isn't configured or the call fails, so the demo never dies on an
// inference hiccup. The Compliance pass downstream doesn't care where the text
// came from — it re-checks either way.
//
// Note the Writer is given the citation but is NOT given a send capability
// anywhere in the codebase: there is no send function it could call. That's
// §6.1's key governance rule enforced structurally, not by prompt.

const MODEL = process.env.SCOUT_WRITER_MODEL ?? "anthropic/claude-3.5-haiku";

let client: ReturnType<typeof createAdminClient> | null = null;

function getClient() {
  if (!integrationStatus.insforge) return null;
  if (!client) {
    client = createAdminClient({
      baseUrl: process.env.INSFORGE_BASE_URL!,
      apiKey: process.env.INSFORGE_API_KEY!,
    });
  }
  return client;
}

const SYSTEM_PROMPT = `You are an SDR writing a first-touch cold email to an automotive dealership.

Hard rules:
- Ground the email in the ONE specific, cited signal you are given. It must be obvious this email could only have been written about this dealer, this week.
- Quote or paraphrase the signal's source quote.
- Never invent statistics, client counts, or outcomes. Never promise guaranteed or risk-free results.
- Never invent a URL or cite a source you were not given.
- Under 120 words. No subject line. No placeholders like {FirstName}. Plain text.
- Sign off as "— Scout".`;

function userPrompt(account: Account, signal: Signal, youCitation: CitedResearch | null): string {
  const research = youCitation
    ? `\n\nAdditional cited research:\n${youCitation.content.slice(0, 800)}\nSources: ${youCitation.sources
        .map((s) => s.url)
        .join(", ")}`
    : "";

  return `Dealership: ${account.name} (${account.city}, ${account.region})

Signal type: ${signal.type}
What we found: ${signal.summary}
Verbatim source quote: "${signal.sourceQuote}"
Source: ${signal.sourceUrl}${research}

Write the email.`;
}

async function generate(messages: { role: "system" | "user"; content: string }[]): Promise<string | null> {
  const db = getClient();
  if (!db) return null;
  try {
    const completion = await db.ai.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.7,
      maxTokens: 400,
    });
    return completion.choices[0]?.message?.content?.trim() ?? null;
  } catch (error) {
    console.warn("[insforge:ai] draft generation failed (falling back to template):", error);
    return null;
  }
}

export async function draftOutreach(
  account: Account,
  signal: Signal,
  youCitation: CitedResearch | null = null
): Promise<string> {
  const generated = await generate([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt(account, signal, youCitation) },
  ]);
  return generated ?? templateDraft(account, signal);
}

export async function reviseDraft(
  previousBody: string,
  signal: Signal,
  vetoReason: string
): Promise<string> {
  const generated = await generate([
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `This draft was VETOED by the Compliance agent.

Draft:
${previousBody}

Veto reason: ${vetoReason}

Rewrite it to resolve the veto. Keep it grounded in the cited signal: "${signal.sourceQuote}" (${signal.sourceUrl}). Return only the rewritten email.`,
    },
  ]);
  return generated ?? templateRevision(previousBody);
}

// ─── Deterministic fallback (no gateway configured) ──────────────────────────
// Note the "over 500 dealerships" line: it is an unverifiable claim, so the
// Compliance agent vetoes it and forces a revision. That is not a bug — it is
// the governance loop demonstrating itself with zero credentials configured.

const SIGNAL_HOOKS: Record<Signal["type"], (s: Signal) => string> = {
  review_cluster: (s) => `I noticed ${s.summary.toLowerCase()}`,
  hiring: (s) => `I saw ${s.summary.toLowerCase()}`,
  new_location: (s) => `Congrats on the new location — I noticed ${s.summary.toLowerCase()}`,
  reputation_dip: (s) => `I noticed ${s.summary.toLowerCase()}`,
};

function templateDraft(account: Account, signal: Signal): string {
  const hook = SIGNAL_HOOKS[signal.type](signal);
  return [
    `Hi ${account.name} team,`,
    ``,
    `${hook} ("${signal.sourceQuote}").`,
    ``,
    `We've helped over 500 dealerships fix this exact issue with a lightweight fix that pays for itself in the first month.`,
    ``,
    `Worth a 15-minute call this week?`,
    ``,
    `— Scout`,
  ].join("\n");
}

function templateRevision(previousBody: string): string {
  return previousBody
    .replace(
      /We've helped over 500 dealerships fix this exact issue with a lightweight fix that pays for itself in the first month\./,
      `A few dealers nearby have tightened this up with a small process change — happy to share what worked.`
    )
    .trim();
}
