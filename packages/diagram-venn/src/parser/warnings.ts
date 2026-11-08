/**
 * The venn warnings of D417, one per kind per parse, each naming every statement it is about:
 * `VENN_DUPLICATE` (a repeated `set` or `union`), `VENN_INVALID_SIZE` (a negative size),
 * `VENN_UNKNOWN_TARGET` (a text node or style naming nothing drawn) and `VENN_EMPTY` (no set,
 * and no error). They read the model as built, with where each entry came from.
 */
import type { Diagnostics, Range } from '@mermaid-js/core/parser-kit';
import { VENN_DUPLICATE, VENN_EMPTY, VENN_INVALID_SIZE, VENN_UNKNOWN_TARGET } from '../codes.ts';
import type { VennStyle, VennSubset, VennTextNode } from '../model.ts';
import { invalidSize } from '../sizes.ts';
import { listOf } from './text.ts';

/** A model entry with the statement it came from. */
export interface Placed<V> {
  value: V;
  range: Range;
  /** What a warning shows of it: the statement quoted, or `the style`. */
  shown: string;
}

/** What the warnings read. */
export interface WarningInput {
  subsets: readonly Placed<VennSubset>[];
  textNodes: readonly Placed<VennTextNode>[];
  styles: readonly Placed<VennStyle>[];
  /** Where `VENN_EMPTY` goes: the header, or the start of the body. */
  header: Range;
  /** The 1-based line of an offset. */
  lineOf: (at: number) => number;
}

/** A key for a list of ids (they may hold any character but `"`). */
const keyOf = (ids: readonly string[]): string => JSON.stringify(ids);

/** Add the D417 warnings of one parse to `d`. */
export function warnVenn(d: Diagnostics, input: WarningInput): void {
  const at = (p: Placed<unknown>) => `${p.shown} at line ${input.lineOf(p.range.start)}`;
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

type At = (p: Placed<unknown>) => string;

/** One warning naming every `set` or `union` that repeats an earlier one. */
function duplicates(d: Diagnostics, { subsets }: WarningInput, at: At): void {
  const seen = new Set<string>();
  const repeats = subsets.filter((p) => {
    const key = keyOf(p.value.sets);
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
  const first = repeats[0];
  if (!first) return;
  const verb = repeats.length === 1 ? 'repeats an earlier one' : 'repeat earlier ones';
  d.warning(
    VENN_DUPLICATE,
    `A set or overlap is declared more than once: ${listOf(repeats.map(at))} ${verb}. Each copy is drawn, and the last size counts; declare each once.`,
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
    `${what} is laid out as 0: ${listOf(bad.map(at))}. ${use}`,
    first.range
  );
}

/**
 * One warning naming every text node and style whose sets are not drawn: no `set` or `union`
 * has them (nor are they a pair of a three-or-more overlap, which v12 adds), and a one-id style
 * names no text node either.
 */
function unknownTargets(d: Diagnostics, input: WarningInput, at: At): void {
  // One key per sets array: indented texts share their union's.
  const keys = new Map<readonly string[], string>();
  const key = (ids: readonly string[]): string => {
    let k = keys.get(ids);
    if (k === undefined) keys.set(ids, (k = keyOf(ids)));
    return k;
  };
  const declared = new Set<string>();
  /** For each id, the three-or-more overlaps it is in (indexes), for the pairs v12 adds. */
  const wide = new Map<string, Set<number>>();
  input.subsets.forEach(({ value }, n) => {
    declared.add(key(value.sets));
    if (value.sets.length < 3) return;
    for (const id of value.sets) {
      let of = wide.get(id);
      if (!of) wide.set(id, (of = new Set()));
      of.add(n);
    }
  });
  const drawn = (ids: readonly string[]): boolean => {
    if (declared.has(key(ids))) return true;
    if (ids.length !== 2) return false;
    const a = wide.get(ids[0] ?? '');
    const b = wide.get(ids[1] ?? '');
    if (!a || !b) return false;
    const [few, many] = a.size < b.size ? [a, b] : [b, a];
    for (const n of few) if (many.has(n)) return true;
    return false;
  };
  const textIds = new Set(input.textNodes.map((t) => t.value.id));
  const named: Placed<unknown>[] = input.textNodes.filter((t) => !drawn(t.value.sets));
  for (const s of input.styles) {
    const { targets } = s.value;
    const one = targets.length === 1 ? targets[0] : undefined;
    if (!drawn(targets) && !(one !== undefined && textIds.has(one))) named.push(s);
  }
  named.sort((a, b) => a.range.start - b.range.start);
  const first = named[0];
  if (!first) return;
  const verb = named.length === 1 ? 'names' : 'name';
  d.warning(
    VENN_UNKNOWN_TARGET,
    `Not drawn: ${listOf(named.map(at))} ${verb} no declared set, overlap or text node. Declare it with \`set\` or \`union\`.`,
    first.range
  );
}
