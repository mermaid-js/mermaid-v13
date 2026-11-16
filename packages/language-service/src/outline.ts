/**
 * The outline (D580): every symbol once, at its definition (the occurrence `definition` goes
 * to, D92), nested by the statements that hold the definitions. A symbol's range is the
 * innermost statement span holding its definition: a subgraph's whole block, the chain a node
 * is first written in. A symbol is a child of the nearest symbol whose range is a statement
 * that holds its own (a node in a subgraph, a state in a composite state, a class in a
 * namespace); symbols in one statement are siblings.
 */
import type { Range, StatementSpan } from '@mermaid-js/core/parser-kit';
import type { DocumentContext } from './context.ts';
import { definitionOf } from './symbols.ts';
import type { Occurrence } from './symbols.ts';

/** One symbol of the outline. Offsets are UTF-16 offsets into the snapshot's text. */
export interface DocumentSymbol {
  readonly name: string;
  /** The facet's kind of the definition: `node`, `subgraph`, `class`, `state`, `participant`, … */
  readonly kind: string;
  /** The innermost statement holding the definition, else the definition itself. */
  readonly range: Range;
  /** The definition: the occurrence `definition` goes to, inside {@link range}. */
  readonly nameRange: Range;
  /**
   * Whether the symbol opens a block: {@link range} is a statement, first written by this
   * symbol, that holds statements of its own (a subgraph, a composite state, a namespace),
   * though they may define nothing new. Adapters show it as a group, whatever the diagram.
   */
  readonly block: boolean;
  /** The symbols defined inside this one's statement, in source order. */
  readonly children: readonly DocumentSymbol[];
}

interface Building {
  name: string;
  kind: string;
  range: Range;
  nameRange: Range;
  block: boolean;
  children: Building[];
}

const isSpan = (s: unknown): s is StatementSpan => {
  const r = (s as StatementSpan | null | undefined)?.range;
  return typeof r?.start === 'number' && typeof r.end === 'number' && r.start <= r.end;
};

/**
 * The statement spans holding `r`, outermost first. Spans of one level are searched by start
 * (each level sorted once), so the outline costs O(definitions × depth × log statements).
 */
function holders(
  top: readonly StatementSpan[],
  r: Range,
  sorted: Map<readonly StatementSpan[], StatementSpan[]>
): StatementSpan[] {
  const path: StatementSpan[] = [];
  let level: readonly StatementSpan[] = top;
  for (;;) {
    let spans = sorted.get(level);
    if (!spans) {
      spans = level.filter(isSpan).sort((a, b) => a.range.start - b.range.start);
      sorted.set(level, spans);
    }
    // The last span starting at or before `r`: spans of one level do not overlap.
    let lo = 0;
    let hi = spans.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (spans[mid]!.range.start <= r.start) lo = mid + 1;
      else hi = mid;
    }
    const s = spans[lo - 1];
    if (!s || s.range.end < r.end) return path;
    path.push(s);
    if (!Array.isArray(s.children)) return path;
    level = s.children;
  }
}

/** The outline of `ctx` from its occurrences (in source order); `[]` without a parse. */
export function outline(
  ctx: DocumentContext,
  list: readonly Occurrence[],
  declaredOnly: boolean
): DocumentSymbol[] {
  const statements = ctx.result?.statements;
  const top = Array.isArray(statements) ? statements : [];
  // Each symbol's occurrences, one per range, as `definition` reads them.
  const groups = new Map<string, Occurrence[]>();
  for (const o of list) {
    const key = `${o.space}\u0000${o.name}`;
    const group = groups.get(key);
    if (!group) groups.set(key, [o]);
    else if (group[group.length - 1]!.range.start !== o.range.start) group.push(o);
  }
  const defs: Occurrence[] = [];
  for (const group of groups.values()) {
    const def = definitionOf(group, declaredOnly);
    if (def) defs.push(def);
  }
  defs.sort((a, b) => a.range.start - b.range.start);
  const sorted = new Map<readonly StatementSpan[], StatementSpan[]>();
  /** The first symbol whose range is each statement. */
  const owner = new Map<StatementSpan, Building>();
  const placed = defs.map((d) => {
    const path = holders(top, d.range, sorted);
    const span = path[path.length - 1];
    const node: Building = {
      name: d.name,
      kind: d.kind,
      range: span ? { start: span.range.start, end: span.range.end } : { ...d.range },
      nameRange: { start: d.range.start, end: d.range.end },
      block: false,
      children: [],
    };
    if (span && !owner.has(span)) {
      owner.set(span, node);
      node.block = Array.isArray(span.children);
    }
    return { node, path };
  });
  const roots: Building[] = [];
  for (const { node, path } of placed) {
    let parent: Building | undefined;
    for (let i = path.length - 2; i >= 0 && !parent; i--) parent = owner.get(path[i]!);
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}
