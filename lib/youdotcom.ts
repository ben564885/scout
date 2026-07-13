import { You } from "@youdotcom-oss/sdk";
import { integrationStatus } from "./env";

// Cited "why now" research via You.com's Research API (verified API:
// `you.research({ input, researchEffort })` → { output: { content, sources } }
// — confirmed against the published @youdotcom-oss/sdk package source).
// Falls back to null when YOU_API_KEY_AUTH is unset.

let client: You | null = null;

function getClient(): You | null {
  if (!integrationStatus.youdotcom) return null;
  if (!client) {
    client = new You({ apiKeyAuth: process.env.YOU_API_KEY_AUTH });
  }
  return client;
}

export type CitedResearch = {
  content: string;
  sources: { url: string; title?: string; snippet?: string }[];
};

export async function researchWhyNow(accountName: string, city: string, region: string): Promise<CitedResearch | null> {
  const you = getClient();
  if (!you) return null;
  try {
    const result = await you.research({
      input: `Find recent, dated, citable news or public complaints about "${accountName}", a business in ${city}, ${region}. Focus on anything that would justify reaching out this week — new locations, hiring pushes, negative review clusters, funding, press.`,
      researchEffort: "lite",
    });
    return {
      content: result.output.content,
      sources: result.output.sources.map((s) => ({
        url: s.url,
        title: s.title,
        snippet: s.snippets?.[0],
      })),
    };
  } catch (error) {
    console.warn(`[you.com] research failed for ${accountName} (falling back to mock signal):`, error);
    return null;
  }
}
