/**
 * Venn's slots (v12 `vennRenderer.ts:41-50, :128-130`): the drawn set at index `i` takes slot
 * `i mod 8`, its class `venn-set-<slot>` and its colour variable `venn<slot + 1>`.
 */
import { VENN_SLOTS } from '../layout/metrics.ts';

/** The colour variable of slot `slot` (0–7): `venn<slot + 1>`. */
export const slotVar = (slot: number): string => `venn${(slot % VENN_SLOTS) + 1}`;
