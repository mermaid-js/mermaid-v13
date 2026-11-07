/**
 * Kanban's priority vocabulary (D375), one definition for the parser's consumers: the four
 * values v12 draws a bar for, most urgent first, and `Medium`, which v12 accepts and draws
 * none for. Matched exactly (case-sensitive).
 */

/** The priorities a card draws a bar for, most urgent first. */
export const BAR_PRIORITIES = ['Very High', 'High', 'Low', 'Very Low'] as const;

/** One of {@link BAR_PRIORITIES}. */
export type KanbanPriority = (typeof BAR_PRIORITIES)[number];

/** The priority v12 accepts without a bar. */
export const NO_BAR_PRIORITY = 'Medium';

const BAR: ReadonlySet<string> = new Set(BAR_PRIORITIES);
const KNOWN: ReadonlySet<string> = new Set([...BAR_PRIORITIES, NO_BAR_PRIORITY]);

/** Whether a card with priority `p` draws a bar. */
export const isBarPriority = (p: string): p is KanbanPriority => BAR.has(p);

/** Whether `p` is one of the five priorities v12 knows (no `KANBAN_PRIORITY` for it). */
export const isKnownPriority = (p: string): boolean => KNOWN.has(p);
