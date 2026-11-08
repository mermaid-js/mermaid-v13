/**
 * The wardley parser's symbol pass (D427), run after the parse so that a node declared after a
 * link still resolves it. A reference to a name no anchor or component declares has no symbol
 * (no definition, references or rename). A name that is a pipeline component's node id,
 * `<parent>_<name>` as v12 builds it (`evolve Kettle_Gas 0.8`, or a component of that name,
 * which v12 merges into the same node), is the parent's name and the component's, each a
 * reference: renaming either keeps the id it is part of.
 */
import type { SymbolOccurrence } from '@mermaid-js/core/parser-kit';
import type { WardleyStatementNode } from './ast.ts';

export interface SymbolPass {
  /** The occurrences the parser recorded, in order. */
  readonly symbols: readonly SymbolOccurrence[];
  readonly src: string;
  /** The names an anchor or component declares. */
  readonly defined: ReadonlySet<string>;
  readonly statements: readonly WardleyStatementNode[];
}

type ChildIds = ReadonlyMap<string, readonly [parent: string, name: string]>;

/** The occurrences to keep, with each pipeline component id split in two. */
export function resolveSymbols({
  symbols,
  src,
  defined,
  statements,
}: SymbolPass): SymbolOccurrence[] {
  const ids = childIds(statements);
  const out: SymbolOccurrence[] = [];
  for (const s of symbols) {
    if (!ids.has(s.name)) {
      if (defined.has(s.name)) out.push(s);
      continue;
    }
    const { start, end } = s.range;
    // The name as written, between its quotes when it has them; else (an escape) no symbol.
    const at = end - start === s.name.length ? start : start + 1;
    if (src.slice(at, at + s.name.length) === s.name) out.push(...parts(s.name, at, ids, defined));
  }
  return out;
}

/** Each pipeline component's node id, with its parent's name and its own (the first wins). */
function childIds(statements: readonly WardleyStatementNode[]): ChildIds {
  const out = new Map<string, readonly [string, string]>();
  for (const n of statements) {
    if (n.type !== 'Pipeline') continue;
    for (const c of n.children) {
      const id = `${n.parent.value}_${c.name.value}`;
      if (!out.has(id)) out.set(id, [n.parent.value, c.name.value]);
    }
  }
  return out;
}

/**
 * The references in the name `name` written at `at`: itself when a node declares it, or its
 * parent's and component's names when it is a pipeline component's id (the parent may be one
 * too); none when it names no node.
 */
function parts(
  name: string,
  at: number,
  ids: ChildIds,
  defined: ReadonlySet<string>
): SymbolOccurrence[] {
  const ref = (n: string, from: number): SymbolOccurrence => ({
    name: n,
    kind: 'node',
    range: { start: from, end: from + n.length },
    role: 'ref',
  });
  const split = ids.get(name);
  if (!split) return defined.has(name) ? [ref(name, at)] : [];
  const [parent, child] = split;
  const head = parts(parent, at, ids, defined);
  return head.length === 0 ? [] : [...head, ref(child, at + parent.length + 1)];
}
