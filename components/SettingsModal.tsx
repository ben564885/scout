"use client";

import { useEffect, useRef, useState } from "react";
import { CompanyContext } from "@/lib/types";
import { SheenButton } from "@/components/Brand";

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [context, setContext] = useState<CompanyContext | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/settings/company")
      .then((r) => r.json())
      .then((data) => {
        setContext(data.context ?? null);
        setDraft(data.context?.content ?? "");
      })
      .catch(() => setError("Could not load company context."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function saveManual() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed.");
      setContext(data.context);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function scrapeUrl() {
    if (!url.trim()) return;
    setScraping(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/company/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scrape failed.");
      setContext(data.context);
      setDraft(data.context.content);
      setUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scrape failed.");
    } finally {
      setScraping(false);
    }
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/settings/company/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed.");
      setContext(data.context);
      setDraft(data.context.content);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden border border-black bg-white">
        <div className="flex items-center justify-between border-b border-black/10 px-6 py-4">
          <div>
            <h1 className="font-display text-xs uppercase tracking-[0.25em] text-black/45">Settings</h1>
            <p className="mt-1 text-sm text-black/50">
              Company context the Writer draws on when it drafts outreach.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center border border-black/15 text-black/50 transition-colors hover:border-black hover:text-black"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto p-6 md:p-8">
          {error && (
            <div className="mb-6 border border-black bg-red-50 p-3 text-sm text-black/80">{error}</div>
          )}

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {/* LEFT: bring context in */}
            <div className="space-y-6">
              <div>
                <label className="mb-2 block font-display text-[10px] uppercase tracking-[0.25em] text-black/45">
                  Pull from a company URL
                </label>
                <div className="flex flex-wrap gap-3">
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !scraping && scrapeUrl()}
                    placeholder="acme.com/about"
                    className="min-w-[180px] flex-1 border border-black/15 px-4 py-2.5 text-sm outline-none transition-colors focus:border-black"
                  />
                  <SheenButton
                    onClick={scrapeUrl}
                    disabled={scraping || !url.trim()}
                    className="bg-black px-6 py-2.5 font-display text-xs uppercase tracking-[0.2em] text-white"
                    sheenClassName="bg-white/25"
                  >
                    {scraping ? "Pulling…" : "Scrape"}
                  </SheenButton>
                </div>
                <p className="mt-2 text-xs text-black/40">Pulled live via Nimble, same as the floor's research.</p>
              </div>

              <div>
                <label className="mb-2 block font-display text-[10px] uppercase tracking-[0.25em] text-black/45">
                  Upload a file
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md,text/plain,text/markdown,application/pdf"
                  onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
                  disabled={uploading}
                  className="block w-full border border-black/15 px-4 py-2.5 text-sm file:mr-3 file:border-0 file:bg-black file:px-3 file:py-1.5 file:font-display file:text-xs file:uppercase file:tracking-wide file:text-white"
                />
                <p className="mt-2 text-xs text-black/40">
                  {uploading ? "Reading the file…" : "PDF, .txt, or .md — a one-pager or sales deck works."}
                </p>
              </div>

              <div>
                <label className="mb-2 block font-display text-[10px] uppercase tracking-[0.25em] text-black/45">
                  Or paste it directly
                </label>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={8}
                  placeholder="We help local service businesses..."
                  className="w-full resize-y border border-black/15 px-4 py-3 text-sm outline-none transition-colors focus:border-black"
                />
                <div className="mt-3 flex items-center gap-3">
                  <SheenButton
                    onClick={saveManual}
                    disabled={saving || loading}
                    className="bg-black px-6 py-2.5 font-display text-xs uppercase tracking-[0.2em] text-white"
                    sheenClassName="bg-white/25"
                  >
                    {saving ? "Saving…" : "Save"}
                  </SheenButton>
                  {context?.updatedAt && (
                    <span className="text-xs text-black/40">
                      Last updated {new Date(context.updatedAt).toLocaleString()}
                      {context.sourceLabel ? ` — from ${context.sourceLabel}` : ""}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT: what's currently on file */}
            <div>
              <h2 className="mb-3 font-display text-xs uppercase tracking-[0.25em] text-black/45">
                Currently on file
              </h2>
              {loading ? (
                <p className="text-sm text-black/40">Loading…</p>
              ) : draft ? (
                <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap border border-black/10 bg-neutral-50 p-4 font-sans text-sm text-black/80">
                  {draft}
                </pre>
              ) : (
                <p className="font-accent text-lg italic text-black/40">
                  Nothing saved yet — scrape a URL, upload a file, or paste context on the left.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
