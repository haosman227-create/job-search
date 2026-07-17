/**
 * Pure account-deletion policy (SPEC-SAAS §5, §7): self-serve deletion with a
 * grace period before the irreversible purge, so an accidental request can be
 * undone. No I/O — the service reads the timestamps and this decides what they
 * mean and when the purge is due.
 */

export const DELETION_GRACE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The purge time for a deletion requested now: grace days later. */
export function purgeAfterFrom(
  requestedAt: Date,
  graceDays: number = DELETION_GRACE_DAYS,
): string {
  return new Date(requestedAt.getTime() + graceDays * DAY_MS).toISOString();
}

export interface DeletionInput {
  deletionRequestedAt: string | null;
  purgeAfter: string | null;
  now: string;
}

export interface DeletionStatus {
  pending: boolean;
  requestedAt: string | null;
  purgeAfter: string | null;
  /** Whole days until the hard delete; null when no deletion is pending. */
  daysRemaining: number | null;
  /** True once the grace period has elapsed and the tenant may be purged. */
  dueForPurge: boolean;
}

export function deletionStatus(input: DeletionInput): DeletionStatus {
  if (!input.deletionRequestedAt || !input.purgeAfter) {
    return {
      pending: false,
      requestedAt: null,
      purgeAfter: null,
      daysRemaining: null,
      dueForPurge: false,
    };
  }
  const remainingMs = Date.parse(input.purgeAfter) - Date.parse(input.now);
  return {
    pending: true,
    requestedAt: input.deletionRequestedAt,
    purgeAfter: input.purgeAfter,
    daysRemaining: Math.max(0, Math.ceil(remainingMs / DAY_MS)),
    dueForPurge: remainingMs <= 0,
  };
}
