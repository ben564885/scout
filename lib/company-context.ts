import { createAdminClient } from "@insforge/sdk";
import { integrationStatus } from "./env";
import { CompanyContext } from "./types";

// Unlike the mock-run mirrors in lib/insforge.ts (best-effort, fire-and-forget
// — the in-memory store is the source of truth), company context has no
// in-memory fallback: InsForge Postgres IS the source of truth, since the
// Settings page needs to read back whatever was last saved. Single-tenant
// demo, single row, always id='default'.

const ROW_ID = "default";
const BUCKET = "company-files";

let client: ReturnType<typeof createAdminClient> | null = null;

function getClient() {
  if (!integrationStatus.insforge) return null;
  if (!client) {
    client = createAdminClient({
      baseUrl: process.env.INSFORGE_BASE_URL!,
      apiKey: process.env.INSFORGE_API_KEY!,
    });
  }
  return client;
}

type Row = {
  content: string;
  source_type: CompanyContext["sourceType"];
  source_label: string | null;
  file_url: string | null;
  updated_at: string;
};

function fromRow(row: Row): CompanyContext {
  return {
    content: row.content,
    sourceType: row.source_type,
    sourceLabel: row.source_label,
    fileUrl: row.file_url,
    updatedAt: row.updated_at,
  };
}

export async function getCompanyContext(): Promise<CompanyContext | null> {
  const db = getClient();
  if (!db) return null;

  const { data, error } = await db.database
    .from("company_context")
    .select()
    .eq("id", ROW_ID);
  if (error) throw error;

  const row = (data as Row[] | null)?.[0];
  return row ? fromRow(row) : null;
}

export async function saveCompanyContext(input: {
  content: string;
  sourceType: CompanyContext["sourceType"];
  sourceLabel?: string | null;
  fileUrl?: string | null;
  fileKey?: string | null;
}): Promise<CompanyContext> {
  const db = getClient();
  if (!db) throw new Error("InsForge is not configured — set INSFORGE_BASE_URL/INSFORGE_API_KEY.");

  const payload = {
    content: input.content,
    source_type: input.sourceType,
    source_label: input.sourceLabel ?? null,
    file_url: input.fileUrl ?? null,
    file_key: input.fileKey ?? null,
    updated_at: new Date().toISOString(),
  };

  const updated = await db.database.from("company_context").update(payload).eq("id", ROW_ID).select();
  if (updated.error) throw updated.error;

  const updatedRow = (updated.data as Row[] | null)?.[0];
  if (updatedRow) return fromRow(updatedRow);

  // No existing row — first save.
  const inserted = await db.database
    .from("company_context")
    .insert([{ id: ROW_ID, ...payload }])
    .select();
  if (inserted.error) throw inserted.error;

  return fromRow((inserted.data as Row[])[0]);
}

// Uploaded source files (PDF/txt/md) — kept for reference; the extracted text
// is what actually feeds `content`.
export async function uploadCompanyFile(
  file: File
): Promise<{ url: string; key: string }> {
  const db = getClient();
  if (!db) throw new Error("InsForge is not configured — set INSFORGE_BASE_URL/INSFORGE_API_KEY.");

  const { data, error } = await db.storage.from(BUCKET).uploadAuto(file);
  if (error || !data) throw error ?? new Error("Upload returned no data.");

  return { url: data.url, key: data.key };
}
