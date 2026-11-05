/**
 * The journey facet's completion table and shared helpers (DESIGN §4.5, D95). Keyword docs are
 * not here: they come from the grammar file (`generated/docs.ts`).
 */
import type { Range, TokenStream } from '@mermaid-js/core/parser-kit';
import type { JourneyTask } from '../model.ts';
import { T } from '../parser/tokens.ts';

/** A keyword item: offered when the parser expects `kind`. */
export interface KeywordItem {
  readonly kind: number;
  readonly label: string;
  /** Text inserted, when it is not the label. */
  readonly insert?: string;
}

/** Statement keywords, in the order they are offered. */
export const KEYWORDS: readonly KeywordItem[] = [
  { kind: T.Journey, label: 'journey' },
  { kind: T.Section, label: 'section', insert: 'section ' },
  { kind: T.Title, label: 'title', insert: 'title ' },
  { kind: T.AccTitle, label: 'accTitle', insert: 'accTitle: ' },
  { kind: T.AccDescr, label: 'accDescr', insert: 'accDescr: ' },
];

/** Index of the last token of `tokens` starting at or before `offset`, or -1. */
export function tokenBefore(tokens: TokenStream, offset: number): number {
  let lo = 0;
  let hi = tokens.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((tokens.start[mid] ?? 0) <= offset) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Markdown inline code holding `text` as written, whatever backticks it has. */
export function code(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const fence = '`'.repeat(Math.max(0, ...runs.map((r) => r.length)) + 1);
  const pad = text.startsWith('`') || text.endsWith('`') || text === '' ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

export const span = (start: number, end: number): Range => ({ start, end });

export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

/** The score's middle: above it a face smiles, below it frowns (v12, `layout/faces.ts`). */
const MID = 3;

/** What a score draws (D226): its face, where, and the warning a render gives for it. */
export function scoreFace(score: number): string {
  if (Number.isNaN(score)) {
    return 'Not a number: a flat face drawn at 3, and the render warns (`JOURNEY_SCORE`)';
  }
  let face = 'flat';
  if (score > MID) face = 'smiling';
  else if (score < MID) face = 'frowning';
  if (score > 5 || score < 0) {
    const at = score > 5 ? 5 : 0;
    return `Outside 0–5: a ${face} face drawn at ${at}, and the render warns (\`JOURNEY_SCORE\`)`;
  }
  return `A ${face} face, drawn at ${score}`;
}

/** The mean score of `tasks` that have a number, to one decimal; `undefined` for none. */
export function meanScore(tasks: readonly JourneyTask[]): string | undefined {
  const scores = tasks.map((t) => t.score).filter((s) => !Number.isNaN(s));
  if (scores.length === 0) return undefined;
  return (scores.reduce((a, s) => a + s, 0) / scores.length).toFixed(1);
}

/** Up to five names as inline code, then how many more. */
export function names(list: readonly string[]): string {
  const shown = list.slice(0, 5).map(code).join(', ');
  return list.length > 5 ? `${shown} and ${list.length - 5} more` : shown;
}
