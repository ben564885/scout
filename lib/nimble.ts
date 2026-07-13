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
const COMPLAINT_KEYWORDS = /\b(wait|waited|delay|never called|no loaner|rude|unresponsive|overcharged|ignored)\b/i;
const HIRING_KEYWORDS = /\b(now hiring|apply now|join our team|we're growing|open positions?|full[- ]time position|hiring for)\b/i;

export const MIN_LIVE_SIGNAL_COUNT = 2;

function contentLines(markdown: string, keywordPattern: RegExp): string[] {
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !NAV_LINK_ONLY.test(line))
    .filter((line) => keywordPattern.test(line));
}

export function detectReviewCluster(markdown: string): { count: number; sampleQuote: string | null } {
  const dates = markdown.match(DATE_PATTERN) ?? [];
  const complaintLines = contentLines(markdown, COMPLAINT_KEYWORDS);
  return {
    count: Math.min(dates.length, complaintLines.length || dates.length),
    sampleQuote: complaintLines[0]?.slice(0, 120) ?? null,
  };
}

export function detectHiringPush(markdown: string): { count: number; sampleQuote: string | null } {
  const hiringLines = contentLines(markdown, HIRING_KEYWORDS);
  return { count: hiringLines.length, sampleQuote: hiringLines[0]?.slice(0, 120) ?? null };
}
