// Central point of truth for which sponsor integrations are actually live
// vs. falling back to mock data. Read by the API routes (to decide whether
// to call a real SDK) and by the UI (to show honest status, not vaporware).

import { kylonConfigured } from "./kylon";

const BAND_AGENT_KEYS = ["PROSPECTOR", "RESEARCHER", "WRITER", "COMPLIANCE", "MANAGER"] as const;

export const integrationStatus = {
  insforge: Boolean(process.env.INSFORGE_BASE_URL && process.env.INSFORGE_API_KEY),
  nimble: Boolean(process.env.NIMBLE_API_KEY),
  youdotcom: Boolean(process.env.YOU_API_KEY_AUTH),
  band: BAND_AGENT_KEYS.every(
    (key) => process.env[`BAND_${key}_AGENT_ID`] && process.env[`BAND_${key}_API_KEY`]
  ),
  hydra: Boolean(process.env.HYDRA_API_KEY && process.env.HYDRA_BASE_URL),
  // Kylon has no API-key-in-env-var story for local dev: `kylon auth login`
  // stores a browser-authenticated session at ~/.kylon/workspace-auth.json
  // that the CLI picks up automatically. KYLON_WORKSPACE_API_KEY (a pak_
  // key) is the alternative for a headless deploy. See lib/kylon.ts.
  kylon: kylonConfigured(),
  agenthog: Boolean(process.env.AGENTOS_API_KEY),
} as const;

export type IntegrationKey = keyof typeof integrationStatus;
