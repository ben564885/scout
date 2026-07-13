import { Account, SignalType } from "./types";

// ─── The vertical depth (PRD §10) ────────────────────────────────────────────
// This file is the moat. The sources and detectors below are hardcoded to
// automotive dealerships — DealerRater, Cars.com, AutoTrader, Indeed — and the
// detectors look for dealer-specific pain (loaner cars, service advisors, BDC
// staffing, rooftops). Repointing Scout at another vertical means REPLACING
// this file, not editing a string. That's the proof of depth: you could not
// turn this into a SaaS prospector by changing a config value.

function slug(account: Account): string {
  return account.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function citySlug(city: string, region: string): string {
  return `${city.toLowerCase().replace(/\s+/g, "-")}-${region.toLowerCase()}`;
}

export type DealerSource = {
  id: string;
  label: string; // named on screen next to the citation
  detects: SignalType;
  url: (account: Account) => string;
};

// Per-account signal surfaces. The Researcher walks these in order and keeps
// the strongest signal it can actually substantiate with a quote.
export const DEALER_SOURCES: DealerSource[] = [
  {
    id: "dealerrater",
    label: "DealerRater",
    detects: "review_cluster",
    url: (a) => `https://www.dealerrater.com/dealer/${slug(a)}-dealer-reviews`,
  },
  {
    id: "google-reviews",
    label: "Google Reviews",
    detects: "review_cluster",
    url: (a) => `https://www.google.com/search?q=${encodeURIComponent(`${a.name} ${a.city} reviews`)}`,
  },
  {
    id: "cars-com",
    label: "Cars.com",
    detects: "new_location",
    url: (a) => `https://www.cars.com/dealers/${slug(a)}/`,
  },
  {
    id: "indeed",
    label: "Indeed",
    detects: "hiring",
    url: (a) => `https://www.indeed.com/cmp/${a.name.replace(/\s+/g, "-")}/jobs`,
  },
  {
    id: "yelp",
    label: "Yelp",
    detects: "reputation_dip",
    url: (a) => `https://www.yelp.com/biz/${slug(a)}-${a.city.toLowerCase().replace(/\s+/g, "-")}`,
  },
];

// Directory pages the Prospector scrapes to BUILD the account list. Dealer
// directories specifically — a SaaS build would use Crunchbase/YC/Product Hunt
// here, which is exactly the point.
export const DEALER_DIRECTORIES: { id: string; label: string; url: (city: string, region: string) => string }[] = [
  {
    id: "cars-com-directory",
    label: "Cars.com dealer directory",
    url: (city, region) => `https://www.cars.com/dealers/${citySlug(city, region)}/`,
  },
  {
    id: "dealerrater-directory",
    label: "DealerRater directory",
    url: (city, region) =>
      `https://www.dealerrater.com/directory/${region.toUpperCase()}/${city.replace(/\s+/g, "-")}`,
  },
];

// How strong each signal type is as a reason to reach out THIS WEEK. The PRD
// (§10.2) calls the negative review cluster the strongest and most demoable —
// a dealership bleeding service reviews will pick up the phone.
export const SIGNAL_PRIORITY: Record<SignalType, number> = {
  review_cluster: 4,
  reputation_dip: 3,
  new_location: 2,
  hiring: 1,
};
