-- Company context (Settings page): the sender's own company background, used
-- to ground Writer drafts. Single-tenant demo — one row, always id='default',
-- upserted from the Settings page. No RLS: all access is server-side via the
-- admin client (lib/company-context.ts), same pattern as the rest of this schema.

create table if not exists company_context (
  id text primary key default 'default',
  content text not null default '',
  source_type text not null default 'manual', -- 'manual' | 'url' | 'file'
  source_label text,          -- the scraped URL, or the uploaded filename
  file_url text,
  file_key text,
  updated_at timestamptz not null default now()
);
