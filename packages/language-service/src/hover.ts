/**
 * Hover (DESIGN §4.5, D93, D96). Front matter answers first: an offset inside it gets the
 * config key's schema docs. The diagram text is the facet's: it gets the token and the symbol
 * occurrence under the offset (one containing it, else one ending at it).
 */
import type { DocumentView, Hover, HoverTarget, Range } from '@mermaid-js/core/parser-kit';
import { frontMatterHover } from './config/hover.ts';
import type { FrontMatterTree } from './config/front-matter.ts';
import type { DocumentContext } from './context.ts';
import { inFrontMatter } from './completion.ts';
import { occurrenceAt } from './symbols.ts';
import type { Occurrence } from './symbols.ts';

/** The non-blank token under `offset`: one containing it, else one ending at it. */
function tokenAt(ctx: DocumentContext, offset: number): HoverTarget['token'] {
  const tokens = ctx.result?.tokens;
  if (!tokens) return undefined;
  // The last token starting at or before the offset.
  let lo = 0;
  let hi = tokens.length - 1;
  let i = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((tokens.start[mid] ?? 0) <= offset) {
      i = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const blank = (j: number) => !/\S/.test(ctx.text.slice(tokens.start[j], tokens.end[j]));
  let touching: number | undefined;
  for (let j = i; j >= 0 && (tokens.end[j] ?? 0) >= offset; j--) {
    if (blank(j)) continue;
    if (offset < (tokens.end[j] ?? 0)) return entry(tokens, j);
    touching ??= j;
  }
  return touching === undefined ? undefined : entry(tokens, touching);
}

function entry(
  tokens: NonNullable<DocumentContext['result']>['tokens'] & object,
  j: number
): { kind: number; range: Range } {
  return { kind: tokens.kind[j]!, range: { start: tokens.start[j]!, end: tokens.end[j]! } };
}

export function hover(
  ctx: DocumentContext,
  fm: FrontMatterTree | undefined,
  occurrences: readonly Occurrence[],
  offset: number,
  /** The frozen view of the snapshot's parse the facet gets (D90). */
  view: () => DocumentView | undefined
): Hover | undefined {
  if (fm !== undefined && inFrontMatter(fm, offset)) return frontMatterHover(ctx, fm, offset);
  const { facet } = ctx;
  const doc = facet && view();
  if (!facet || !doc) return undefined;
  const token = tokenAt(ctx, offset);
  const o = occurrenceAt(occurrences, offset);
  const target: HoverTarget = {
    offset,
    ...(token ? { token } : {}),
    ...(o ? { symbol: { name: o.name, kind: o.kind, role: o.role, range: o.range } } : {}),
  };
  // Even with no token: a keyword the lexer emits no token for (`click`) is the facet's to find.
  return facet.hover(target, doc);
}
