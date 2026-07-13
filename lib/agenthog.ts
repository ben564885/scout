import { init } from "agenthog";

// Module-level init so every importer shares one client. Safe to import even
// with AGENTOS_API_KEY unset (see .env.example) — per the SDK's contract, no
// public method throws; every emit is just a silent no-op until a real key
// is configured.
init({
  apiKey: process.env.AGENTOS_API_KEY,
  workspaceId: process.env.AGENTOS_WORKSPACE_ID,
  agentId: "scout",
  // agenthog@0.4.0 leaves Config.sdkVersion defaulted to "0.0.0" instead of
  // reading its own package.json, and the ingestion endpoint 426s on that —
  // pass the real version explicitly until upstream fixes the default.
  sdkVersion: "0.4.0",
});

export { startTaskRun, tool, getDefaultClient } from "agenthog";
