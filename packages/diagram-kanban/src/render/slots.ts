/**
 * Kanban's column colour variables (D374): `kanbanColumn<n>` is v12's `adjuster(cScale<n>, 10)`
 * (`styles.ts:18-30`), one per `cScale` slot; column k (from 1) takes slot `(k + 1) mod 12`, so
 * past column 10 the slots cycle where v12 had no rule and drew black. The rules are on the
 * plugin's theme table (`plugin.ts`).
 */
import { PALETTE_LIMIT } from '@mermaid-js/core/theme';

/** The column colour variable of `cScale` slot `n`. */
export const columnVar = (n: number): string => `kanbanColumn${n}`;

/** The `cScale` slot of column `k` (from 1): `(k + 1) mod 12` (D374). */
export const columnSlot = (k: number): number => (k + 1) % PALETTE_LIMIT;

/** `f(n)` for each slot, as an object keyed by `columnVar(n)`. */
export function perSlot<T>(f: (n: number) => T): Record<string, T> {
  const out: Record<string, T> = {};
  for (let n = 0; n < PALETTE_LIMIT; n++) out[columnVar(n)] = f(n);
  return out;
}
