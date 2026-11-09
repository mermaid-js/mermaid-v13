/**
 * Venn's slots (v12 `vennRenderer.ts:41-50, :128-130`): the drawn set at index `i` takes slot
 * `i mod 8`, its class `venn-set-<slot>` and its colour variable `venn<slot + 1>`.
 */

/** v12's slot count: classes `venn-set-0`…`venn-set-7`, colours `venn1`…`venn8`. */
export const VENN_SLOTS = 8;

/** The slot of the drawn set at `index` (0, 1, …). */
export const slotOf = (index: number): number => index % VENN_SLOTS;

/** The colour variable of slot `slot` (0–7): `venn<slot + 1>`. */
export const slotVar = (slot: number): string => `venn${slotOf(slot) + 1}`;
