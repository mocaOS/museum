import type { Holdings } from "./types";

/**
 * Who may submit a document to the Library: a wallet must hold at least
 * `MIN_MOCA_TO_SUBMIT` $MOCA, OR at least one Art DeCC0, OR at least one MOCA
 * ROOM. Spam control ahead of the admin review step. Pure + client-safe (used by
 * the Submit button gate and enforced again server-side on the submit route).
 */

export const MIN_MOCA_TO_SUBMIT = 100;

export const SUBMIT_REQUIREMENT_TEXT =
  "Hold at least 100 $MOCA, 1 Art DeCC0, or 1 MOCA ROOM to submit a document.";

export function isEligibleToSubmit(
  holdings: Holdings | null | undefined,
): boolean {
  if (!holdings) return false;
  const moca = Number(holdings.moca?.total ?? "0");
  if (Number.isFinite(moca) && moca >= MIN_MOCA_TO_SUBMIT) return true;
  return (holdings.collections ?? []).some((c) => (c.items?.length ?? 0) > 0);
}
