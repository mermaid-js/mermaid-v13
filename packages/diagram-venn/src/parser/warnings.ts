/**
 * The venn warnings of D417, one per kind per parse, each naming every statement it is about:
 * `VENN_DUPLICATE` (a repeated `set` or `union`), `VENN_INVALID_SIZE` (a negative size),
 * `VENN_UNKNOWN_TARGET` (a text node or style naming nothing drawn) and `VENN_EMPTY` (no set,
 * and no error). They read the model as built, with where each entry came from.
 */
import { formatList } from '@mermaid-js/core/parser-kit';
import type { Diagnostics, Range } from '@mermaid-js/core/parser-kit';
import { VENN_DUPLICATE, VENN_EMPTY, VENN_INVALID_SIZE, VENN_UNKNOWN_TARGET } from '../codes.ts';
import {
  idsKey,
  pairwiseRule,
  type VennStyle,
  type VennSubset,
  type VennTextNode,
} from '../model.ts';
import { invalidSize } from '../sizes.ts';
import type { VennName } from './ast.ts';
import { idText } from './text.ts';

/** A model entry with the statement it came from. */
export interface Sourced<V> {
  value: V;
  range: Range;
  /** What a warning calls it before the quote, if anything: `the text node`, `the style`. */
  what?: string;
  /** The source a warning quotes for it: the statement, or a text node's id. */
  quote?: Range;
  /** The set ids it names as written (a `text`'s sets, a `style`'s targets), with ranges. */
  ids?: readonly VennName[];
}

/** What the warnings read. */
export interface WarningInput {
  subsets: readonly Sourced<VennSubset>[];
  textNodes: readonly Sourced<VennTextNode>[];
  styles: readonly Sourced<VennStyle>[];
  /** Where `VENN_EMPTY` goes: the header, or the start of the body. */
  header: Range;
  /** The 1-based line of an offset. */
  lineOf: (at: number) => number;
  /** The source text at a range as a message quotes it. */
  quote: (r: Range) => string;
  /** One `VENN_UNKNOWN_TARGET` per unknown id, for the editor (`VennParseOptions`). */
  perOccurrence?: boolean;
}

/** Add the D417 warnings of one parse to `d`. */
export function warnVenn(d: Diagnostics, input: WarningInput): void {
  const at = (p: Sourced<unknown>) => {
    const shown = [p.what, p.quote && input.quote(p.quote)].filter(Boolean).join(' ');
    return `${shown} at line ${input.lineOf(p.range.start)}`;
  };
  duplicates(d, input, at);
  sizes(d, input, at);
  unknownTargets(d, input, at);
  if (input.subsets.length === 0 && !d.hasErrors) {
    d.warning(
      VENN_EMPTY,
      'The diagram has no sets, so only its title is drawn. Add a set with `set A`.',
      input.header
    );
  }
}

type At = (p: Sourced<unknown>) => string;

/** One warning naming every `set` or `union` that repeats an earlier one. */
function duplicates(d: Diagnostics, { subsets }: WarningInput, at: At): void {
  const seen = new Set<string>();
  const repeats = subsets.filter((p) => {
    const key = idsKey(p.value.sets);
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
  const first = repeats[0];
  if (!first) return;
  const verb = repeats.length === 1 ? 'repeats an earlier one' : 'repeat earlier ones';
  d.warning(
    VENN_DUPLICATE,
    `A set or overlap is declared more than once: ${formatList(repeats.map(at))} ${verb}. Each copy is drawn, and the last size counts; declare each once.`,
    first.range
  );
}

/**
 * One warning naming every size laid out as 0 though not written so: below 0, or too large to
 * square (D417, `../sizes.ts`).
 */
function sizes(d: Diagnostics, { subsets }: WarningInput, at: At): void {
  const bad = subsets.filter((p) => invalidSize(p.value.size));
  const first = bad[0];
  if (!first) return;
  const huge = bad.some((p) => p.value.size > 0);
  const what = huge ? 'A size below 0, or too large to lay out,' : 'A size below 0';
  const use = huge
    ? 'Use a size of 0 or more, with at most 154 digits.'
    : 'Use a size of 0 or more.';
  d.warning(
    VENN_INVALID_SIZE,
    `${what} is laid out as 0: ${formatList(bad.map(at))}. ${use}`,
    first.range
  );
}

/**
 * One warning naming every text node and style whose sets are not drawn: no `set` or `union`
 * has them (nor are they a pair of a three-or-more overlap, which v12 adds), and a one-id style
 * names no text node either. With `perOccurrence`, one warning per id of those that no `set`
 * declares, at the id, or, when every id is declared, one per statement at its ids (no
 * `union` has that overlap).
 */
function unknownTargets(d: Diagnostics, input: WarningInput, at: At): void {
  // One key per sets array: indented texts share their union's.
  const keys = new Map<readonly string[], string>();
  const key = (ids: readonly string[]): string => {
    let k = keys.get(ids);
    if (k === undefined) keys.set(ids, (k = idsKey(ids)));
    return k;
  };
  const declared = new Set<string>();
  for (const { value } of input.subsets) declared.add(key(value.sets));
  const pairs = pairwiseRule(input.subsets.map((p) => p.value));
  const drawn = (ids: readonly string[]): boolean =>
    declared.has(key(ids)) || (ids.length === 2 && pairs.covers(ids[0]!, ids[1]!));
  const textIds = new Set(input.textNodes.map((t) => t.value.id));
  const named: Sourced<unknown>[] = input.textNodes.filter((t) => !drawn(t.value.sets));
  for (const s of input.styles) {
    const { targets } = s.value;
    const one = targets.length === 1 ? targets[0] : undefined;
    if (!drawn(targets) && !(one !== undefined && textIds.has(one))) named.push(s);
  }
  named.sort((a, b) => a.range.start - b.range.start);
  if (input.perOccurrence) {
    for (const p of named) eachUnknown(d, p, at, (id) => declared.has(idsKey([id])));
    return;
  }
  const first = named[0];
  if (!first) return;
  const verb = named.length === 1 ? 'names' : 'name';
  d.warning(
    VENN_UNKNOWN_TARGET,
    `Not drawn: ${formatList(named.map(at))} ${verb} no declared set, overlap or text node. Declare it with \`set\` or \`union\`.`,
    first.range
  );
}

/** The editor's warnings for one statement `unknownTargets` found (see there). */
function eachUnknown(d: Diagnostics, p: Sourced<unknown>, at: At, isSet: (id: string) => boolean) {
  const ids = p.ids ?? [];
  const missing = ids.filter((n) => !isSet(n.name));
  for (const m of missing) {
    const id = idText(m.name);
    d.warning(
      VENN_UNKNOWN_TARGET,
      `Not drawn: no \`set ${id}\` declares \`${id}\`, which ${at(p)} names. Declare it with \`set ${id}\`.`,
      m.range
    );
  }
  const first = ids[0];
  const last = ids[ids.length - 1];
  if (missing.length > 0 || !first || !last) return;
  const overlap = `union ${ids.map((n) => idText(n.name)).join(',')}`;
  d.warning(
    VENN_UNKNOWN_TARGET,
    `Not drawn: no \`${overlap}\` declares the overlap ${at(p)} names. Declare it with \`${overlap}\`.`,
    { start: first.range.start, end: last.range.end }
  );
}
