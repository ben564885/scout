// Seed data standing in for live Nimble pulls (DealerRater, Google Reviews,
// Cars.com, Indeed) until Nimble API credentials are wired in. Shape matches
// exactly what the Prospector/Researcher agents would persist from a real
// pull, so swapping the source is a lib/prospector.ts change, not a UI one.

import { Account, Signal } from "./types";

export const ACCOUNTS: Account[] = [
  {
    id: "acct-fremont-auto",
    name: "Fremont Auto Group",
    vertical: "automotive_dealership",
    city: "Fremont",
    region: "CA",
    website: "fremontautogroup.example.com",
    contactPath: "sales@fremontautogroup.example.com",
    valueTier: "high_value",
    estValueUsd: 2_100_000,
  },
  {
    id: "acct-bayshore-motors",
    name: "Bayshore Motors",
    vertical: "automotive_dealership",
    city: "Redwood City",
    region: "CA",
    website: "bayshoremotors.example.com",
    contactPath: "info@bayshoremotors.example.com",
    valueTier: "routine",
    estValueUsd: 180_000,
  },
  {
    id: "acct-peninsula-cdjr",
    name: "Peninsula CDJR",
    vertical: "automotive_dealership",
    city: "San Mateo",
    region: "CA",
    website: "peninsulacdjr.example.com",
    contactPath: "gm@peninsulacdjr.example.com",
    valueTier: "routine",
    estValueUsd: 240_000,
  },
];

export const SIGNALS: Signal[] = [
  {
    id: "sig-fremont-reviews",
    accountId: "acct-fremont-auto",
    type: "review_cluster",
    summary:
      "3 service-department reviews in the last 34 days cite the same complaint: multi-day wait times with no loaner offered.",
    strength: 86,
    sourceUrl: "https://www.dealerrater.com/dealer/Fremont-Auto-Group-review-12345",
    sourceQuote: "waited 4 days and never got a call back about my loaner",
    detectedAt: "2026-07-09T14:00:00.000Z",
  },
  {
    id: "sig-bayshore-hiring",
    accountId: "acct-bayshore-motors",
    type: "hiring",
    summary:
      "4 open BDC/service-advisor postings on Indeed in the last 21 days, up from 0 in the prior quarter.",
    strength: 61,
    sourceUrl: "https://www.indeed.com/cmp/Bayshore-Motors/jobs",
    sourceQuote: "hiring 4 Service Advisors — start immediately",
    detectedAt: "2026-07-11T09:30:00.000Z",
  },
  {
    id: "sig-peninsula-newlot",
    accountId: "acct-peninsula-cdjr",
    type: "new_location",
    summary:
      "New satellite lot opened on El Camino Real, listed on Cars.com 18 days ago with no dedicated service bay yet.",
    strength: 54,
    sourceUrl: "https://www.cars.com/dealers/peninsula-cdjr-el-camino",
    sourceQuote: "new location now open — inventory arriving weekly",
    detectedAt: "2026-07-08T11:15:00.000Z",
  },
];

export function accountWithSignal(accountId: string) {
  const account = ACCOUNTS.find((a) => a.id === accountId);
  const signal = SIGNALS.find((s) => s.accountId === accountId);
  if (!account || !signal) return null;
  return { account, signal };
}
