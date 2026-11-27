/**
 * The venn model (spec #429): what the parser (T2) produces and the layout (T3) reads. Plain,
 * serialisable data in source order (R-ARCH-7), holding what v12's DB (`vennDB.ts`) held:
 *
 * - ids, labels and text as v12's grammar handed them to its DB and its `normalizeText` left
 *   them: trimmed, then one pair of surrounding `"` removed; entities as written (`&amp;`, and
 *   v12's `#35;` form as `&#35;`), resolved when labels are laid out;
 * - member ids sorted with `Array.prototype.sort` (UTF-16 order), as v12 sorted them, but on
 *   the text above: v12 sorted its `encodeEntities` placeholders (`ﬂ°°35¶ß`), so ids holding an
 *   entity can come in another order than v12's (a listed divergence, `union-entity-sort`);
 * - a size as written (`parseFloat`), negative ones too (the layout reads them as 0, with
 *   `VENN_INVALID_SIZE`); with none, `10 / n²` for `n` ids as written (`union A,A` is 2.5);
 * - style values as v12 joined them: a quoted value without its quotes, other value tokens
 *   joined with one blank (`12px` is `12 px`); a later key replaces an earlier one in place.
 *
 * Nothing is checked against the declared sets but what v12 checked (a `union` names declared
 * sets): text nodes and styles may name anything (`VENN_UNKNOWN_TARGET`). Shared contract of
 * the venn tickets: change it only additively, and say so in `v13/docs/agents/runs/429/GAPS.md`.
 */
import type { AstId, Diagnostic } from '@mermaid-js/core/parser-kit';

/** A `set` (one id) or a `union` (two or more), v12's `VennData`. */
export interface VennSubset {
  /** `set:<id>`, `union:<id>+<id>…`; `@2`, … for a repeat (D418). */
  readonly ast: AstId;
  /** The member ids, sorted; one for a `set`. */
  readonly sets: readonly string[];
  /** As written, or `10 / n²` for `n` ids written. */
  readonly size: number;
  /** The `[…]` label, when written and not empty. */
  readonly label?: string;
  /**
   * Set when the text drawn for it, the label or else a set's id, was written as a markdown
   * string (`["`…`"]`, `set "`…`"`, #1368). Its quotes are gone; without them a text in backticks
   * is drawn as written, so the parser marks it. The text keeps its backticks, as v12's did.
   */
  readonly markdown?: true;
}

/** A `text` statement or an indented `text` line, v12's `VennTextData`. */
export interface VennTextNode {
  /** `text:<id>`; `@2`, … for a repeat (D418). */
  readonly ast: AstId;
  /**
   * The sets of the area it sits in, sorted: as written, or the last `set` or `union`'s for an
   * indented one (a `union` that failed v12's checks gives none, and its indented text lines
   * are not in the model).
   */
  readonly sets: readonly string[];
  readonly id: string;
  /** The `[…]` label, when written and not empty. */
  readonly label?: string;
  /** As for {@link VennSubset.markdown}: the label, or else the id. */
  readonly markdown?: true;
}

/** A `style` statement, v12's `VennStyleData`. */
export interface VennStyle {
  /** `style:<n>`, 1-based (D418). */
  readonly ast: AstId;
  /** The target ids, sorted: one set or text node, or the sets of an overlap. */
  readonly targets: readonly string[];
  /** Keys in first-written order, each with its last value (v12's object). */
  readonly properties: Readonly<Record<string, string>>;
}

export interface VennModel {
  /** Sets and overlaps in source order (v12's `getSubsetData()`); repeats are kept. */
  readonly subsets: readonly VennSubset[];
  /** In source order (v12's `getTextData()`). */
  readonly textNodes: readonly VennTextNode[];
  /** In source order (v12's `getStyleData()`). */
  readonly styles: readonly VennStyle[];
  /**
   * The last in-text `title` if non-empty, else the front-matter `title` (D218); one pair of
   * surrounding quotes removed (D416). Absent when neither.
   */
  readonly title?: string;
  /** Set when the in-text title was written as a markdown string (`title "`…`"`, #1368). */
  readonly titleMarkdown?: true;
  /** Warnings of the parse (also in `ParseResult.diagnostics`, D417). */
  readonly warnings: readonly Diagnostic[];
}

/**
 * The one key of an id list (a subset's sets, a text node's area, a style's targets): equal
 * lists, and only those, have equal keys, whatever the ids hold (`,`, `|`, `"`, `__proto__`).
 * The parser's warnings, the solver, the layout, its invariants and the facet all key by it.
 */
export const idsKey = (ids: readonly string[]): string => JSON.stringify(ids);

/** An empty record with no prototype, so an id such as `__proto__` is a key like any other. */
export const nullRecord = <V>(): Record<string, V> => Object.create(null) as Record<string, V>;

/** The id of a `set` entry (one id), or undefined for an overlap. */
export const setIdOf = (entry: { readonly sets: readonly string[] }): string | undefined =>
  entry.sets.length === 1 ? entry.sets[0] : undefined;

/** The least number of sets of an overlap whose pairs v12 adds. */
const WIDE = 3;

/**
 * v12's `ensurePairwiseSubsets` rule (`vennRenderer.ts`): every pair of sets of an overlap of
 * three or more is drawn, the ones with no entry of their own added once, after the model's.
 * The layout lays the added pairs out ({@link PairwiseRule.added}); the parser's warnings only
 * ask whether a pair is drawn ({@link PairwiseRule.covers}), without listing every pair.
 */
interface PairwiseRule {
  /** Whether v12 draws the overlap of `a` and `b`: one overlap of three or more has both. */
  covers(a: string, b: string): boolean;
  /**
   * The pairs v12 adds, in its order: each wide overlap's pairs (its ids sorted, `i < j`) that
   * no entry and no earlier pair has.
   */
  added(): [string, string][];
}

/** {@link PairwiseRule} over `entries` (subsets in source order). */
export function pairwiseRule(
  entries: readonly { readonly sets: readonly string[] }[]
): PairwiseRule {
  /** For each id, the wide overlaps it is in (indexes into `entries`). */
  const wide = new Map<string, Set<number>>();
  entries.forEach(({ sets }, n) => {
    if (sets.length < WIDE) return;
    for (const id of sets) {
      let of = wide.get(id);
      if (!of) wide.set(id, (of = new Set()));
      of.add(n);
    }
  });
  return {
    covers(a, b) {
      const x = wide.get(a);
      const y = wide.get(b);
      if (!x || !y) return false;
      const [few, many] = x.size < y.size ? [x, y] : [y, x];
      for (const n of few) if (many.has(n)) return true;
      return false;
    },
    added() {
      const existing = new Set(entries.map((e) => idsKey(e.sets)));
      const out: [string, string][] = [];
      for (const { sets } of entries) {
        if (sets.length < WIDE) continue;
        const members = [...sets].sort();
        for (let i = 0; i < members.length - 1; i++) {
          for (let j = i + 1; j < members.length; j++) {
            const pair: [string, string] = [members[i]!, members[j]!];
            const key = idsKey(pair);
            if (existing.has(key)) continue;
            existing.add(key);
            out.push(pair);
          }
        }
      }
      return out;
    },
  };
}
