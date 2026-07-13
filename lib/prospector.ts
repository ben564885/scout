import { Account, ValueTier } from "./types";
import { extractPage, MapsPlace, searchDealerPlaces } from "./nimble";
import { DEALER_DIRECTORIES } from "./sources";
import { ACCOUNTS } from "./mock-data";
import { integrationStatus } from "./env";

// The Prospector (PRD §5.1): turns ONE plain-language goal into a ranked,
// deduped account list. This is the front half of the "AI employee" test —
// the human states an outcome, not a series of steps.

export type Goal = {
  raw: string;
  city: string;
  region: string;
  vertical: string;
};

// Cities we can resolve without an LLM call, so goal parsing never becomes a
// point of failure on stage. Anything unrecognized falls back to the Bay Area.
const KNOWN_CITIES: Record<string, string> = {
  fremont: "CA",
  oakland: "CA",
  "san jose": "CA",
  "san francisco": "CA",
  "redwood city": "CA",
  "san mateo": "CA",
  hayward: "CA",
  berkeley: "CA",
  concord: "CA",
  "walnut creek": "CA",
  "palo alto": "CA",
  "santa clara": "CA",
  sunnyvale: "CA",
  "bay area": "CA",
};

export function parseGoal(raw: string): Goal {
  const lower = raw.toLowerCase();

  const match = Object.keys(KNOWN_CITIES)
    .filter((city) => lower.includes(city))
    // Prefer the most specific city named ("redwood city" over a bare "bay area").
    .sort((a, b) => b.length - a.length)[0];

  const city = match ?? "Bay Area";

  return {
    raw,
    city: city.replace(/\b\w/g, (c) => c.toUpperCase()),
    region: KNOWN_CITIES[city] ?? "CA",
    vertical: "automotive_dealership",
  };
}

// Tiering heuristic (drives the whole escalation boundary in §6.1). Dealer
// groups with multiple rooftops are materially bigger accounts than a single
// independent lot, and the name is the cheapest reliable tell — "Auto Group",
// "Automotive Group", and franchise-brand names run far larger books than a
// standalone used-car lot. Anything at or above the threshold must be signed
// off by a human; the Manager cannot approve it alone.
const HIGH_VALUE_THRESHOLD_USD = 1_000_000;

const GROUP_MARKERS = /\b(group|automotive|auto mall|motors? group|family of dealerships|holdings)\b/i;
const FRANCHISE_MARKERS = /\b(toyota|honda|ford|chevrolet|bmw|mercedes|lexus|audi|subaru|cdjr|chrysler|nissan)\b/i;

function estimateValue(name: string): number {
  let value = 180_000; // baseline independent used-car lot
  if (FRANCHISE_MARKERS.test(name)) value += 400_000; // franchise rooftop
  if (GROUP_MARKERS.test(name)) value += 1_500_000; // multi-rooftop group
  return value;
}

export function tierFor(estValueUsd: number): ValueTier {
  return estValueUsd >= HIGH_VALUE_THRESHOLD_USD ? "high_value" : "routine";
}

// Real structured place -> Account. Preferred over parseDirectory below: a
// Nimble google_maps_search hit carries a real place_id (lets the Researcher
// pull that exact place's reviews next), a real phone number (a better
// contact_path than a guessed URL), and a real rating/review_count instead of
// heuristics scraped off a directory page.
function accountFromPlace(place: MapsPlace, goal: Goal): Account {
  const estValueUsd = estimateValue(place.title);
  return {
    id: `acct-${place.placeId}`,
    name: place.title,
    vertical: goal.vertical,
    city: goal.city,
    region: goal.region,
    website: place.websiteUrl ?? place.mapsUrl,
    contactPath: place.phoneNumber ?? place.websiteUrl ?? place.mapsUrl,
    valueTier: tierFor(estValueUsd),
    estValueUsd,
    placeId: place.placeId,
    phone: place.phoneNumber ?? undefined,
    rating: place.rating ?? undefined,
    reviewCount: place.reviewCount ?? undefined,
  };
}

// Dealer names as they appear in a scraped directory: markdown links or
// headings whose text reads like a dealership. We require a dealer-ish token so
// the parser doesn't scoop up the directory site's own nav chrome ("Sign in",
// "Browse by state") — the same false-positive class already guarded against in
// lib/nimble.ts.
const DEALER_NAME = /\b(auto|motors?|dealership|cars?|automotive|toyota|honda|ford|chevrolet|bmw|nissan|subaru|lexus|cdjr)\b/i;
const MARKDOWN_LINK = /\[([^\]]{4,60})\]\(([^)]+)\)/g;

function parseDirectory(markdown: string, goal: Goal): Account[] {
  const seen = new Set<string>();
  const accounts: Account[] = [];

  for (const [, label, href] of markdown.matchAll(MARKDOWN_LINK)) {
    const name = label.trim().replace(/\s+/g, " ");
    if (!DEALER_NAME.test(name)) continue;
    if (name.length < 5) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const estValueUsd = estimateValue(name);
    accounts.push({
      id: `acct-${key.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`,
      name,
      vertical: goal.vertical,
      city: goal.city,
      region: goal.region,
      website: href.startsWith("http") ? href : `https://www.cars.com${href}`,
      contactPath: href.startsWith("http") ? href : `https://www.cars.com${href}`,
      valueTier: tierFor(estValueUsd),
      estValueUsd,
    });
  }

  return accounts;
}

export type ProspectResult = {
  goal: Goal;
  accounts: Account[];
  live: boolean; // did Nimble actually build this list, or is it the cached fallback?
  sourceLabel: string;
};

// Ranked: highest-value accounts first, so the escalation-worthy ones lead the
// floor's queue and the demo opens on the account that matters.
function rank(accounts: Account[]): Account[] {
  return [...accounts].sort((a, b) => b.estValueUsd - a.estValueUsd);
}

export async function prospect(rawGoal: string, limit = 3): Promise<ProspectResult> {
  const goal = parseGoal(rawGoal);

  if (integrationStatus.nimble) {
    // Preferred path: Nimble's google_maps_search agent returns real dealers
    // with a place_id, phone number, and rating — no markdown scraping or
    // regex needed to build the list. Falls through to the directory scrape
    // below only if Maps comes back empty (e.g. an obscure city).
    const places = await searchDealerPlaces(`used car dealerships in ${goal.city}, ${goal.region}`);
    if (places && places.length >= 2) {
      const accounts = places.map((place) => accountFromPlace(place, goal));
      return {
        goal,
        accounts: rank(accounts).slice(0, limit),
        live: true,
        sourceLabel: "Google Maps (Nimble)",
      };
    }

    for (const directory of DEALER_DIRECTORIES) {
      const markdown = await extractPage(directory.url(goal.city, goal.region));
      if (!markdown) continue;

      const parsed = parseDirectory(markdown, goal);
      // One stray link isn't a list. Require enough hits that we're confident we
      // parsed a real directory page and not a redirect to a generic landing
      // page — the exact failure mode already seen from live Nimble output.
      if (parsed.length >= 2) {
        return {
          goal,
          accounts: rank(parsed).slice(0, limit),
          live: true,
          sourceLabel: directory.label,
        };
      }
    }
  }

  // Cached fallback (PRD §15: "live pull is the list — low stakes"). The floor
  // still runs end to end; only the provenance line changes.
  return {
    goal,
    accounts: rank(ACCOUNTS).slice(0, limit),
    live: false,
    sourceLabel: "cached dealer list",
  };
}
