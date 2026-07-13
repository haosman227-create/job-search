-- Persist per-field header confidence from extraction so the review screen can
-- highlight low-confidence vendor / invoice number / date / total the same way
-- it already highlights low-confidence line fields (CLAUDE.md: low-confidence
-- AI data must be visually distinguished).

alter table public.invoice
  add column header_confidence jsonb not null default '{}'::jsonb;
