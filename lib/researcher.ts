import { Account, Signal, SignalType } from "./types";
import { DETECTORS, MIN_LIVE_SIGNAL_COUNT, extractPage } from "./nimble";
import { DEALER_SOURCES, SIGNAL_PRIORITY } from "./sources";
import { CitedResearch, researchWhyNow } from "./youdotcom";
import { integrationStatus } from "./env";
import { nextId } from "./store";

// The Researcher (PRD §5.1): finds a cited "why now" per account by walking the
// dealer-specific surfaces in lib/sources.ts and running the matching detector
// over each. Async data gathering is kept out of the (synchronous,
// deterministic) governance pipeline so the governance loop never depends on
// network calls — real data in, same reliable control flow out.
//
// Returns `null` when it cannot substantiate a reason to reach out. That is a
// feature, not a gap: Scout's whole thesis is signal-first outbound, so an
// account with no signal gets no email. The Compliance agent would veto the
// draft anyway (it cannot cite a source that does not exist).

export type ResearchResult = {
  signal: Signal | null;
  youCitation: CitedResearch | null;
  sourcesChecked: string[];
};

function buildSignal(
  account: Account,
  type: SignalType,
  detection: { count: number; sampleQuote: string | null },
  sourceUrl: string,
  sourceLabel: string
): Signal {
  const summaries: Record<SignalType, string> = {
    review_cluster: `${detection.count} recent reviews on ${sourceLabel} cite the same solvable service complaint.`,
    hiring: `${detection.count} recent sales/BDC/service postings on ${sourceLabel} — staffing up under load.`,
    new_location: `${detection.count} signals on ${sourceLabel} point to a new rooftop opening.`,
    reputation_dip: `Rating trending down on ${sourceLabel} — ${detection.sampleQuote}.`,
  };

  return {
    id: nextId("sig"),
    accountId: account.id,
    type,
    summary: summaries[type],
    strength: Math.min(100, 40 + detection.count * 15),
    sourceUrl,
    sourceQuote: detection.sampleQuote ?? "",
    detectedAt: new Date().toISOString(),
  };
}

export async function gatherSignal(
  account: Account,
  fallbackSignal: Signal | null = null
): Promise<ResearchResult> {
  const sourcesChecked: string[] = [];
  const candidates: Signal[] = [];

  if (integrationStatus.nimble) {
    for (const source of DEALER_SOURCES) {
      const url = source.url(account);
      const markdown = await extractPage(url);
      sourcesChecked.push(source.label);
      if (!markdown) continue;

      const detection = DETECTORS[source.detects](markdown);
      // Mirrors the PRD's own detector thresholds (§10.2: "≥3 recent reviews",
      // "multiple recent postings") — never fire on a single stray match.
      if (detection.sampleQuote && detection.count >= MIN_LIVE_SIGNAL_COUNT) {
        candidates.push(buildSignal(account, source.detects, detection, url, source.label));
      }
    }
  }

  // Strongest reason wins: a negative review cluster beats a hiring post
  // (§10.2), and within a type, more corroborating hits beats fewer.
  candidates.sort(
    (a, b) => SIGNAL_PRIORITY[b.type] - SIGNAL_PRIORITY[a.type] || b.strength - a.strength
  );

  const signal = candidates[0] ?? fallbackSignal;

  const youCitation =
    signal && integrationStatus.youdotcom
      ? await researchWhyNow(account.name, account.city, account.region)
      : null;

  return { signal, youCitation, sourcesChecked };
}
