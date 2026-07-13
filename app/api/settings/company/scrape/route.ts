import { NextRequest, NextResponse } from "next/server";
import { extractPage } from "@/lib/nimble";
import { saveCompanyContext } from "@/lib/company-context";
import { integrationStatus } from "@/lib/env";

export const maxDuration = 30; // one Nimble extract call, capped at 20s (lib/nimble.ts)

export async function POST(req: NextRequest) {
  const { url } = await req.json();
  if (typeof url !== "string" || !url.trim()) {
    return NextResponse.json({ error: "Give a company URL to scrape." }, { status: 400 });
  }

  if (!integrationStatus.nimble) {
    return NextResponse.json({ error: "Nimble isn't configured — set NIMBLE_API_KEY." }, { status: 400 });
  }

  const target = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;

  const markdown = await extractPage(target);
  if (!markdown) {
    return NextResponse.json({ error: `Couldn't pull content from ${target}.` }, { status: 502 });
  }

  try {
    const context = await saveCompanyContext({
      content: markdown.trim(),
      sourceType: "url",
      sourceLabel: target,
    });
    return NextResponse.json({ context });
  } catch (error) {
    console.error("[settings/company/scrape] save failed:", error);
    return NextResponse.json({ error: "Scraped the page but couldn't save it." }, { status: 500 });
  }
}
