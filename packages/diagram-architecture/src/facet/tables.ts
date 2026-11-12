/**
 * The architecture facet's tables and shared helpers (DESIGN §4.5, D95). Keyword docs are not
 * here: they come from the grammar file (`generated/docs.ts`).
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import type { CompletionKind, Range, TokenStream } from '@mermaid-js/core/parser-kit';
import type { ArchitectureModel, ArchitectureSide } from '../model.ts';
import { ARCHITECTURE_TRIVIA, T } from '../parser/tokens.ts';

/** An item offered when the parser expects `kind`. */
export interface KeywordItem {
  readonly kind: number;
  readonly label: string;
  readonly item: CompletionKind;
  /** Text inserted, when it is not the label. */
  readonly insert?: string;
  /** One short line next to the label. */
  readonly detail?: string;
  /** Offered only as the first word of its line (the statements). */
  readonly lineStart?: true;
  /** Offered only right after the left-hand side (an arrow that starts with `<`). */
  readonly afterSide?: true;
  /** Offered only after `--` or `-[label]-` (the right-hand arrowhead). */
  readonly afterArrow?: true;
}

const statement = (kind: number, label: string, insert = `${label} `): KeywordItem => ({
  kind,
  label,
  item: 'keyword',
  insert,
  lineStart: true,
});

/** What each side is called in details and hover. */
export const SIDE_NAMES: Readonly<Record<ArchitectureSide, string>> = {
  L: 'left',
  R: 'right',
  T: 'top',
  B: 'bottom',
};

/**
 * Everything completion offers but ids, icons and `{group}`, in the order it is offered: the
 * header, the statements (both `accDescr` forms), `row` and `column` after `align`, `in` after
 * a declaration's id, icon or label, the sides, and the arrows after a left-hand side.
 */
export const ITEMS: readonly KeywordItem[] = [
  { kind: T.ArchitectureBeta, label: 'architecture-beta', item: 'keyword' },
  statement(T.Service, 'service'),
  statement(T.Group, 'group'),
  statement(T.Junction, 'junction'),
  statement(T.Align, 'align'),
  statement(T.Title, 'title'),
  statement(T.AccTitle, 'accTitle', 'accTitle: '),
  statement(T.AccDescr, 'accDescr:', 'accDescr: '),
  statement(T.AccDescr, 'accDescr {', 'accDescr { }'),
  { kind: T.Row, label: 'row', item: 'keyword', insert: 'row ' },
  { kind: T.Column, label: 'column', item: 'keyword', insert: 'column ' },
  { kind: T.In, label: 'in', item: 'keyword', insert: 'in ' },
  ...(Object.entries(SIDE_NAMES) as [ArchitectureSide, string][]).map(
    ([side, name]): KeywordItem => ({
      kind: T.Direction,
      label: side,
      item: 'constant',
      detail: name,
    })
  ),
  { kind: T.DashDash, label: '--', item: 'operator', detail: 'edge' },
  { kind: T.DashDash, label: '-->', item: 'operator', detail: 'edge, arrowhead on the right' },
  {
    kind: T.ArrowInto,
    label: '<--',
    item: 'operator',
    detail: 'edge, arrowhead on the left',
    afterSide: true,
  },
  {
    kind: T.ArrowInto,
    label: '<-->',
    item: 'operator',
    detail: 'edge, arrowheads on both ends',
    afterSide: true,
  },
  { kind: T.Dash, label: '-[label]-', item: 'operator', detail: 'labelled edge' },
  {
    kind: T.ArrowInto,
    label: '>',
    item: 'operator',
    detail: 'arrowhead on the right',
    afterArrow: true,
  },
];

/**
 * v12's seven built-in icons (D505), in its order. The renderer draws them
 * (`render/builtins.ts`, which the language bundle must not reach); a spec checks the two lists
 * agree.
 */
export const BUILTIN_ICON_NAMES: readonly string[] = [
  'database',
  'server',
  'disk',
  'internet',
  'cloud',
  'unknown',
  'blank',
];

/** A service, junction or group of the model, with its kind. */
export type Element =
  | { kind: 'service'; element: ArchitectureModel['services'][number] }
  | { kind: 'junction'; element: ArchitectureModel['junctions'][number] }
  | { kind: 'group'; element: ArchitectureModel['groups'][number] };

/** The model's element with id `id`, the way v12 registered it (groups first). */
export function elementOf(model: ArchitectureModel, id: string): Element | undefined {
  const group = model.groups.find((g) => g.id === id);
  if (group) return { kind: 'group', element: group };
  const service = model.services.find((s) => s.id === id);
  if (service) return { kind: 'service', element: service };
  const junction = model.junctions.find((j) => j.id === id);
  return junction && { kind: 'junction', element: junction };
}

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

/**
 * The indexes of the significant tokens of the line before `at` that end at or before it, first
 * to last, without the `architecture-beta` header (the first statement may share its line).
 * Token indexes, unlike other facets' text-based `lineBefore`.
 */
export function lineTokens(tokens: TokenStream | undefined, at: number): number[] {
  const out: number[] = [];
  if (!tokens) return out;
  for (let j = tokenBefore(tokens, at); j >= 0; j--) {
    if ((tokens.end[j] ?? 0) > at || (tokens.start[j] ?? 0) >= at) continue;
    const k = tokens.kind[j] ?? Kind.EOF;
    if (k === Kind.Newline) break;
    if (ARCHITECTURE_TRIVIA[k] !== 1) out.push(j);
  }
  out.reverse();
  return tokens.kind[out[0] ?? -1] === T.ArchitectureBeta ? out.slice(1) : out;
}

/** Markdown inline code holding `text` as written, whatever backticks it has. */
export function code(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const fence = '`'.repeat(Math.max(0, ...runs.map((r) => r.length)) + 1);
  const pad = text.startsWith('`') || text.endsWith('`') || text === '' ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

export const span = (start: number, end: number): Range => ({ start, end });

/** Whether `offset` is in `r`, its ends included. */
export const inside = (offset: number, r: Range): boolean => r.start <= offset && offset <= r.end;
