import { Account, Signal, SignalType } from "./types";
import {
  DETECTORS,
  MIN_LIVE_SIGNAL_COUNT,
  MapsDetection,
  extractPage,
  detectReputationDipFromReviews,
  detectReviewClusterFromReviews,
  detectWeakSignalFromReviews,
  getPlaceReviews,
} from "./nimble";
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
  // A real-but-below-the-strict-bar candidate — one negative review instead
  // of the required corroborating cluster, or any measurable rating dip
  // instead of a ≥0.5★ one. Never fabricated: it's the same detectors on the
  // same real data, just without the strict count/magnitude requirement.
  // Only ever consulted by the floor's top-up pass (lib/pipeline.ts) when a
  // run's strict-bar hit rate falls short of its minimum valid-signal quota.
  weakSignal: Signal | null;
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

// Same idea as buildSignal, but off a MapsDetection: a real per-review
// citation URL and a real review timestamp, instead of a guessed directory
// URL and "detected right now."
function buildMapsSignal(
  account: Account,
  type: "review_cluster" | "reputation_dip",
  detection: MapsDetection
): Signal {
  const summaries: Record<"review_cluster" | "reputation_dip", string> = {
    review_cluster: `${detection.count} recent Google reviews cite the same solvable service complaint.`,
    reputation_dip: `Rating trending down on Google Maps — ${detection.sampleQuote}.`,
  };

  return {
    id: nextId("sig"),
    accountId: account.id,
    type,
    summary: summaries[type],
    strength: Math.min(100, 40 + detection.count * 15),
    sourceUrl: detection.sourceUrl,
    sourceQuote: detection.sampleQuote,
    detectedAt: new Date(detection.detectedAtMs || Date.now()).toISOString(),
  };
}

// The "general_activity" weak-candidate kind isn't a complaint or a dip — it's
// just the most recent real review, surfaced honestly as "recent activity"
// rather than mislabeled as a solvable complaint (which buildMapsSignal's
// review_cluster wording would imply). Real quote, real URL, weakest strength
// of any tier — only reached when an account has reviews but no negative
// signal of any kind.
function buildNeutralActivitySignal(account: Account, detection: MapsDetection): Signal {
  return {
    id: nextId("sig"),
    accountId: account.id,
    type: "review_cluster",
    summary: "Recent customer review activity on Google Maps — no specific complaint, just an opening to reach out.",
    strength: 35,
    sourceUrl: detection.sourceUrl,
    sourceQuote: detection.sampleQuote,
    detectedAt: new Date(detection.detectedAtMs || Date.now()).toISOString(),
  };
}

// Last-resort quota filler (lib/pipeline.ts) for an account with genuinely no
// review data at all — nothing real to cite. Explicitly fabricated and
// flagged `synthetic: true` so the UI can mark it as such; this is a
// deliberate, demo-only deviation from Scout's signal-first thesis, not the
// product's real behavior. Cycles a few generic templates for variety; the
// pick is deterministic per account so re-running the same floor doesn't
// reshuffle which filler an account gets.
const SYNTHETIC_TEMPLATES: { type: SignalType; summary: string; quote: string }[] = [
  {
    type: "review_cluster",
    summary: "Recent customer reviews mention slower response times during busy periods.",
    quote: "Took a while to hear back after my initial inquiry, but the team was helpful once we connected.",
  },
  {
    type: "hiring",
    summary: "Job listings suggest the sales team is scaling up.",
    quote: "Now hiring experienced sales consultants — competitive pay plan.",
  },
  {
    type: "reputation_dip",
    summary: "Rating has softened slightly over the last quarter.",
    quote: "Still a solid experience overall, though a bit less polished than before.",
  },
];

export function buildSyntheticSignal(account: Account): Signal {
  let hash = 0;
  for (const char of account.id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const template = SYNTHETIC_TEMPLATES[Math.abs(hash) % SYNTHETIC_TEMPLATES.length];

  return {
    id: nextId("sig"),
    accountId: account.id,
    type: template.type,
    summary: template.summary,
    strength: 25,
    sourceUrl: account.website || account.contactPath,
    sourceQuote: template.quote,
    detectedAt: new Date().toISOString(),
    synthetic: true,
  };
}

export async function gatherSignal(
  account: Account,
  fallbackSignal: Signal | null = null
): Promise<ResearchResult> {
  const sourcesChecked: string[] = [];
  const candidates: Signal[] = [];
  const weakCandidates: Signal[] = [];

  const useMapsReviews = integrationStatus.nimble && !!account.placeId;
  // An account with a place_id already gets the authoritative real-review
  // check below — a markdown scrape of a generic Google search results page
  // (the "google-reviews" DEALER_SOURCES entry) or DealerRater/Yelp is
  // strictly noisier for the same underlying reviews, so skip those for any
  // account we could actually query directly. Only accounts without a
  // place_id (the cached mock-account path) fall back to them.
  const sources = integrationStatus.nimble
    ? account.placeId
      ? DEALER_SOURCES.filter((s) => s.detects !== "review_cluster" && s.detects !== "reputation_dip")
      : DEALER_SOURCES
    : [];

  // The Maps reviews pull and every markdown source are independent reads —
  // fire them all concurrently instead of chaining Maps reviews before the
  // markdown sources. Each is a real Nimble call that can itself take up to
  // ~20-25s (page-render timing, not just network RTT), so a sequential
  // "reviews, then sources" chain was paying both timeouts back to back on
  // any account where either one ran slow.
  const [reviews, pulls] = await Promise.all([
    useMapsReviews ? getPlaceReviews(account.placeId!) : Promise.resolve(null),
    Promise.all(
      sources.map(async (source) => {
        const url = source.url(account);
        const markdown = await extractPage(url);
        return { source, url, markdown };
      })
    ),
  ]);

  // Runs first so its "sourcesChecked" label leads the list, matching the
  // old sequential order even though the calls above are now concurrent.
  if (useMapsReviews) {
    sourcesChecked.push("Google Maps Reviews");
    if (reviews && reviews.length) {
      const cluster = detectReviewClusterFromReviews(reviews);
      if (cluster) candidates.push(buildMapsSignal(account, "review_cluster", cluster));

      const dip = detectReputationDipFromReviews(reviews, account.rating ?? null);
      if (dip) candidates.push(buildMapsSignal(account, "reputation_dip", dip));

      // Below-the-strict-bar fallback — only useful when neither check above
      // found anything; harmless to compute either way since only accounts
      // with no strong signal ever consult it (lib/pipeline.ts).
      const weak = detectWeakSignalFromReviews(reviews, account.rating ?? null);
      if (weak) {
        weakCandidates.push(
          weak.kind === "general_activity"
            ? buildNeutralActivitySignal(account, weak.detection)
            : buildMapsSignal(account, weak.kind, weak.detection)
        );
      }
    }
  }

  for (const { source, url, markdown } of pulls) {
    sourcesChecked.push(source.label);
    if (!markdown) continue;

    const detection = DETECTORS[source.detects](markdown);
    if (!detection.sampleQuote) continue;
    // Mirrors the PRD's own detector thresholds (§10.2: "≥3 recent reviews",
    // "multiple recent postings") — never fire on a single stray match.
    if (detection.count >= MIN_LIVE_SIGNAL_COUNT) {
      candidates.push(buildSignal(account, source.detects, detection, url, source.label));
    } else if (detection.count >= 1) {
      weakCandidates.push(buildSignal(account, source.detects, detection, url, source.label));
    }
  }

  // Strongest reason wins: a negative review cluster beats a hiring post
  // (§10.2), and within a type, more corroborating hits beats fewer.
  candidates.sort(
    (a, b) => SIGNAL_PRIORITY[b.type] - SIGNAL_PRIORITY[a.type] || b.strength - a.strength
  );
  // Weak candidates lead with strength, not type-priority: the neutral
  // "general_activity" fallback is tagged type "review_cluster" (the closest
  // real category) purely to satisfy the Signal type, but at strength 35 —
  // sorting by type-priority first would rank it above a genuine single
  // complaint/dip pick just because review_cluster outranks reputation_dip,
  // which is backwards.
  weakCandidates.sort((a, b) => b.strength - a.strength || SIGNAL_PRIORITY[b.type] - SIGNAL_PRIORITY[a.type]);

  const signal = candidates[0] ?? fallbackSignal;
  const weakSignal = weakCandidates[0] ?? null;

  const youCitation =
    signal && integrationStatus.youdotcom
      ? await researchWhyNow(account.name, account.city, account.region)
      : null;

  return { signal, weakSignal, youCitation, sourcesChecked };
}
