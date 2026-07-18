-- P0 audit fix: claim-then-apply without a transaction loses billing updates.
-- If processing failed AFTER the event id was recorded, Stripe's retry hit the
-- primary key, was treated as a duplicate, and the plan change was dropped
-- forever. The event row now tracks whether it was actually APPLIED: a
-- redelivery of an unapplied event resumes the work instead of skipping it
-- (at-least-once + an idempotent state overwrite = safe).

alter table public.stripe_event
  add column applied boolean not null default false;

-- Events recorded before this migration were all fully processed.
update public.stripe_event set applied = true;
