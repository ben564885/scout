import Nimble from "@nimble-way/nimble-js";
import { integrationStatus } from "./env";

// Real Prospector/Researcher data pull via Nimble's extract endpoint
// (verified API: `client.extract({ url, render })` → markdown/html of the
// page — confirmed against the published @nimble-way/nimble-js package).
// Falls back to null when NIMBLE_API_KEY is unset; callers fall back to the
// curated mock signals in lib/mock-data.ts, matching the PRD's "cached list
// as fallback" directive for Prospector.

let client: Nimble | null = null;

function getClient(): Nimble | null {
  if (!integrationStatus.nimble) return null;
  if (!client) {
    client = new Nimble({ apiKey: process.env.NIMBLE_API_KEY });
  }
  return client;
}

export async function extractPage(url: string): Promise<string | null> {
  const nimble = getClient();
  if (!nimble) return null;
  try {
    // `formats: ["markdown"]` is required — omitting it returns only `html`
    // (confirmed against the live API; the README's inline example omits it).
    const response = await nimble.extract({ url, render: true, formats: ["markdown"] });
    return response.data?.markdown ?? null;
  } catch (error) {
    console.warn(`[nimble] extract failed for ${url} (falling back to mock):`, error);
    return null;
  }
}

// Best-effort heuristic signal detectors over extracted page text. Confirmed
// against real Nimble output (2026-07-13): a fictional/non-existent dealer
// URL gets redirected to the site's generic landing page, and naive keyword
// matching false-positives on nav chrome (e.g. Indeed's own "Hiring Lab"
// blog link matched /hiring/i). Two guards against that:
//   1. Drop lines that are pure markdown nav links (`* [Label](url)` with no
//      other text) — real review/posting text is never link-only.
//   2. Require a minimum match count before trusting live data over the
//      curated mock, mirroring the PRD's own detector thresholds (§11:
//      "≥3 recent reviews", "multiple recent postings") rather than firing
//      on a single stray match.

const NAV_LINK_ONLY = /^[\s*\-•]*\[[^\]]*\]\([^)]*\)[\s.]*$/;

const DATE_PATTERN = /\b(?:\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Z][a-z]+ \d{1,2},? \d{4}|\d+ (?:days?|weeks?) ago)\b/g;

// Dealer-specific complaint vocabulary (PRD §10.2) — loaner cars, service
// write-ups, financing friction, and BDC follow-up are the failure modes that
// actually predict a dealership deal. A generic "negative sentiment" classifier
// would miss all of them.
const COMPLAINT_KEYWORDS =
  /\b(wait|waited|delay|never called|no loaner|loaner|service (?:department|advisor|writer)|rude|unresponsive|overcharged|ignored|financing|run.?around|still waiting|no call ?back)\b/i;
const HIRING_KEYWORDS =
  /\b(now hiring|apply now|join our team|we're growing|open positions?|full[- ]time position|hiring for|service advisor|sales consultant|bdc|business development center|finance manager)\b/i;
const NEW_LOCATION_KEYWORDS =
  /\b(new (?:location|dealership|store|rooftop|lot)|now open|grand opening|second location|newly opened|expanding to|acquire[ds]?|new showroom)\b/i;
const RATING_PATTERN = /\b([1-5](?:\.\d)?)\s*(?:out of 5|\/\s*5|stars?)\b/gi;

export const MIN_LIVE_SIGNAL_COUNT = 2;

export type Detection = { count: number; sampleQuote: string | null };

function contentLines(markdown: string, keywordPattern: RegExp): string[] {
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !NAV_LINK_ONLY.test(line))
    .filter((line) => keywordPattern.test(line));
}

export function detectReviewCluster(markdown: string): Detection {
  const dates = markdown.match(DATE_PATTERN) ?? [];
  const complaintLines = contentLines(markdown, COMPLAINT_KEYWORDS);
  return {
    count: Math.min(dates.length, complaintLines.length || dates.length),
    sampleQuote: complaintLines[0]?.slice(0, 120) ?? null,
  };
}

export function detectHiringPush(markdown: string): Detection {
  const hiringLines = contentLines(markdown, HIRING_KEYWORDS);
  return { count: hiringLines.length, sampleQuote: hiringLines[0]?.slice(0, 120) ?? null };
}

export function detectNewLocation(markdown: string): Detection {
  const lines = contentLines(markdown, NEW_LOCATION_KEYWORDS);
  return { count: lines.length, sampleQuote: lines[0]?.slice(0, 120) ?? null };
}

// A reputation dip needs a *comparison*, not a keyword. We take every star
// rating on the page and check whether the recent ones sit below the page's
// overall average — a dealer whose last few reviews are 1–2★ against a 4★
// lifetime average is actively bleeding reputation right now, which is the
// "why now" that makes them answer the phone.
export function detectReputationDip(markdown: string): Detection {
  const ratings = [...markdown.matchAll(RATING_PATTERN)].map((m) => parseFloat(m[1]));
  if (ratings.length < 4) return { count: 0, sampleQuote: null };

  const average = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
  const recent = ratings.slice(0, Math.max(3, Math.floor(ratings.length / 3)));
  const recentAverage = recent.reduce((sum, r) => sum + r, 0) / recent.length;
  const drop = average - recentAverage;

  if (drop < 0.5) return { count: 0, sampleQuote: null };

  // Count the dip's magnitude in the same units the other detectors use, so a
  // steeper drop outranks a shallower one when the Researcher picks a winner.
  return {
    count: Math.max(MIN_LIVE_SIGNAL_COUNT, Math.round(drop * 4)),
    sampleQuote: `recent reviews averaging ${recentAverage.toFixed(1)}★ against a ${average.toFixed(1)}★ lifetime average`,
  };
}

export const DETECTORS: Record<string, (markdown: string) => Detection> = {
  review_cluster: detectReviewCluster,
  hiring: detectHiringPush,
  new_location: detectNewLocation,
  reputation_dip: detectReputationDip,
};
