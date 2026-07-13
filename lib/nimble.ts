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

// The SDK defaults to a 3-minute per-request timeout with 2 retries, which on
// its own can exceed this route's whole maxDuration. Cap each call at 20s and
// don't retry — callers already fall back to mock data on a null return, so a
// fast failure here is strictly better than a slow one.
const EXTRACT_TIMEOUT_MS = 20_000;

export async function extractPage(url: string): Promise<string | null> {
  const nimble = getClient();
  if (!nimble) return null;
  try {
    // `formats: ["markdown"]` is required — omitting it returns only `html`
    // (confirmed against the live API; the README's inline example omits it).
    const response = await nimble.extract(
      { url, render: true, formats: ["markdown"] },
      { timeout: EXTRACT_TIMEOUT_MS, maxRetries: 0 }
    );
    return response.data?.markdown ?? null;
  } catch (error) {
    console.warn(`[nimble] extract failed for ${url} (falling back to mock):`, error);
    return null;
  }
}

// ─── Google Maps agents (Prospector list-building + Researcher review data) ─
// Nimble ships pre-built structured-extraction agents on top of `extract`.
// Confirmed live (2026-07-13) against `nimble.agent.run(...)`:
//   - "google_maps_search" -> data.parsing.entities.SearchResult[], each with
//     title/address/phone_number/place_id/rating/review_summary
//     (overall_rating, review_count, ratings_count by star) and
//     place_information.website_url.
//   - "google_maps_reviews" (params: { place_id }) -> data.parsing.entities.
//     Review[], each with description (full text), rating, review_timestamp
//     (unix ms), relative_time, and review_maps_link (a real, clickable
//     citation URL for one specific dated review).
// This replaces markdown-regex scraping for review-based signals with real
// structured data — an actual review URL + quote + timestamp per signal,
// not a guessed DealerRater slug and a keyword match over generic markdown.

export type MapsPlace = {
  title: string;
  address: string;
  phoneNumber: string | null;
  placeId: string;
  websiteUrl: string | null;
  mapsUrl: string;
  rating: number | null;
  reviewCount: number | null;
};

export type MapsReview = {
  text: string;
  rating: number;
  relativeTime: string;
  timestampMs: number;
  reviewUrl: string;
};

const AGENT_TIMEOUT_MS = 25_000;

// Nimble's `title` occasionally comes back with markdown heading/list markers
// still attached (e.g. "## Coggin Honda of Orlando") since the field is
// scraped off a rendered page rather than a clean structured API. Strip that
// before it becomes account.name — it flows straight into UI copy and the
// Writer's draft greeting (lib/writer.ts).
function cleanTitle(title: string): string {
  return title.replace(/^[#*\-•\s]+/, "").trim();
}

export async function searchDealerPlaces(query: string, page?: number): Promise<MapsPlace[] | null> {
  const nimble = getClient();
  if (!nimble) return null;
  try {
    const result = await nimble.agent.run(
      { agent: "google_maps_search", params: page ? { query, page } : { query } },
      { timeout: AGENT_TIMEOUT_MS, maxRetries: 0 }
    );
    // `data.parsing` is typed as a success/error union; narrow it ourselves
    // since a successful google_maps_search response's `entities` shape isn't
    // modeled per-agent in the SDK's generated types.
    const parsing = result.data?.parsing as { entities?: Record<string, Record<string, any>[]> } | undefined;
    const results = parsing?.entities?.SearchResult;
    if (!Array.isArray(results)) return null;
    return results
      .filter((r) => r.place_id && r.title)
      .map((r) => ({
        title: cleanTitle(r.title),
        address: r.address ?? "",
        phoneNumber: r.phone_number ?? null,
        placeId: r.place_id,
        websiteUrl: r.place_information?.website_url ?? null,
        mapsUrl: r.place_url ?? "",
        rating: r.review_summary?.overall_rating ?? null,
        reviewCount: r.review_summary?.review_count ?? null,
      }));
  } catch (error) {
    console.warn(`[nimble] google_maps_search failed for "${query}" (falling back):`, error);
    return null;
  }
}

export async function getPlaceReviews(placeId: string): Promise<MapsReview[] | null> {
  const nimble = getClient();
  if (!nimble) return null;
  try {
    const result = await nimble.agent.run(
      { agent: "google_maps_reviews", params: { place_id: placeId } },
      { timeout: AGENT_TIMEOUT_MS, maxRetries: 0 }
    );
    const parsing = result.data?.parsing as { entities?: Record<string, Record<string, any>[]> } | undefined;
    const reviews = parsing?.entities?.Review;
    if (!Array.isArray(reviews)) return null;
    return reviews.map((r) => ({
      text: r.description ?? "",
      rating: Number(r.rating) || 0,
      relativeTime: r.relative_time ?? "",
      timestampMs: Number(r.review_timestamp) || 0,
      reviewUrl: r.review_maps_link ?? "",
    }));
  } catch (error) {
    console.warn(`[nimble] google_maps_reviews failed for ${placeId} (falling back):`, error);
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

// ─── Detectors over structured Maps reviews (real quote + real date + real
// citation URL per signal, instead of a keyword match over scraped markdown).

const RECENT_REVIEW_WINDOW_DAYS = 120;

function daysSince(timestampMs: number): number {
  return (Date.now() - timestampMs) / (1000 * 60 * 60 * 24);
}

export type MapsDetection = {
  count: number;
  sampleQuote: string;
  sourceUrl: string;
  detectedAtMs: number;
};

// Negative rating is required, not just a keyword hit: a keyword like
// "wait" or "financing" matches plenty of 5★ reviews praising a short wait
// or smooth financing (confirmed live — a 5★ One Toyota of Oakland review
// praising "quick and easy" service tripped the old keyword-only check via
// "wait comfortably" and "service advi[sor]"). Real per-review star ratings
// are exactly what markdown-scraping never had; use them.
const NEGATIVE_RATING_THRESHOLD = 3;

export function detectReviewClusterFromReviews(reviews: MapsReview[]): MapsDetection | null {
  const recentComplaints = reviews
    .filter((r) => r.timestampMs && daysSince(r.timestampMs) <= RECENT_REVIEW_WINDOW_DAYS)
    .filter((r) => r.rating > 0 && r.rating <= NEGATIVE_RATING_THRESHOLD)
    .filter((r) => COMPLAINT_KEYWORDS.test(r.text))
    .sort((a, b) => b.timestampMs - a.timestampMs);

  if (recentComplaints.length < MIN_LIVE_SIGNAL_COUNT) return null;

  const top = recentComplaints[0];
  return {
    count: recentComplaints.length,
    sampleQuote: top.text.slice(0, 160),
    sourceUrl: top.reviewUrl,
    detectedAtMs: top.timestampMs,
  };
}

// Same "recent average vs lifetime average" logic as detectReputationDip, but
// off real per-review ratings/timestamps instead of every star pattern found
// on a scraped page (which conflates the dealer's own rating with unrelated
// numbers elsewhere on the page).
export function detectReputationDipFromReviews(
  reviews: MapsReview[],
  overallRating: number | null
): MapsDetection | null {
  if (!overallRating || reviews.length < 4) return null;

  const byRecency = [...reviews].sort((a, b) => b.timestampMs - a.timestampMs);
  const recent = byRecency.slice(0, Math.max(3, Math.floor(byRecency.length / 3)));
  const recentAverage = recent.reduce((sum, r) => sum + r.rating, 0) / recent.length;
  const drop = overallRating - recentAverage;

  if (drop < 0.5) return null;

  const worst = [...recent].sort((a, b) => a.rating - b.rating)[0];
  return {
    count: Math.max(MIN_LIVE_SIGNAL_COUNT, Math.round(drop * 4)),
    sampleQuote: `recent reviews averaging ${recentAverage.toFixed(1)}★ against a ${overallRating.toFixed(1)}★ lifetime average — most recently: "${worst.text.slice(0, 100)}"`,
    sourceUrl: worst.reviewUrl,
    detectedAtMs: worst.timestampMs,
  };
}
