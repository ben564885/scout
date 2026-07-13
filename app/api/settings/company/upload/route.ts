import { NextRequest, NextResponse } from "next/server";
import { extractText } from "unpdf";
import { saveCompanyContext, uploadCompanyFile } from "@/lib/company-context";

export const maxDuration = 30;

const MAX_BYTES = 15 * 1024 * 1024; // 15MB

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Attach a file." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is too large (15MB max)." }, { status: 400 });
  }

  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const isText = file.type.startsWith("text/") || /\.(txt|md)$/i.test(file.name);
  if (!isPdf && !isText) {
    return NextResponse.json({ error: "Upload a PDF, .txt, or .md file." }, { status: 400 });
  }

  let content: string;
  try {
    if (isPdf) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { text } = await extractText(bytes, { mergePages: true });
      content = text;
    } else {
      content = await file.text();
    }
  } catch (error) {
    console.error("[settings/company/upload] text extraction failed:", error);
    return NextResponse.json({ error: "Couldn't read that file." }, { status: 422 });
  }

  if (!content.trim()) {
    return NextResponse.json({ error: "That file didn't contain any readable text." }, { status: 422 });
  }

  // Keep the original file for reference, but don't let a storage hiccup lose
  // the extracted text — that's the part that actually matters.
  let fileUrl: string | null = null;
  let fileKey: string | null = null;
  try {
    const uploaded = await uploadCompanyFile(file);
    fileUrl = uploaded.url;
    fileKey = uploaded.key;
  } catch (error) {
    console.warn("[settings/company/upload] storing original file failed (non-fatal):", error);
  }

  try {
    const context = await saveCompanyContext({
      content: content.trim(),
      sourceType: "file",
      sourceLabel: file.name,
      fileUrl,
      fileKey,
    });
    return NextResponse.json({ context });
  } catch (error) {
    console.error("[settings/company/upload] save failed:", error);
    return NextResponse.json({ error: "Extracted the text but couldn't save it." }, { status: 500 });
  }
}
