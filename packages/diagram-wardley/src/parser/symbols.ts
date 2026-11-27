/**
 * The wardley parser's symbol pass (D427), run after the parse so that a node declared after a
 * link still resolves it. A reference to a name no anchor or component declares has no symbol
 * (no definition, references or rename). A name that is a pipeline component's node id,
 * `<parent>_<name>` as v12 builds it (`evolve Kettle_Gas 0.8`, or a component of that name,
 * which v12 merges into the same node), is the parent's name and the component's, each a
 * reference: renaming either keeps the id it is part of.
 *
 * The name after `pipeline` is a node id, as the parser resolves it: an anchor's or a
 * component's name, or a pipeline component's id. A pipeline component's own name there names
 * no node (`WARDLEY_UNKNOWN_PARENT`), so it has no symbol; a link's ends, which v12 also
 * resolved by label, keep it. So does the name after `evolve` (D745): the parser resolves it as
 * a node id too, but a pipeline component's own name there is reported as that component
 * (`WARDLEY_EVOLVE_PIPELINE_COMPONENT`), so renaming the component renames it with it.
 */
import type { SymbolOccurrence } from '@mermaid-js/core/parser-kit';
import type { WardleyStatementNode } from './ast.ts';
import { childId } from './ids.ts';

export interface SymbolPass {
  /** The occurrences the parser recorded, in order: replaced by those kept. */
  readonly symbols: SymbolOccurrence[];
  readonly src: string;
  /** The names an anchor or component declares, a pipeline's components included. */
  readonly defined: ReadonlySet<string>;
  readonly statements: readonly WardleyStatementNode[];
}

type ChildIds = ReadonlyMap<string, readonly [parent: string, name: string]>;

/** Keep the occurrences that name a node, each pipeline component id split in two. */
export function resolveSymbols({ symbols, src, defined, statements }: SymbolPass): void {
  const ids = pipelineChildIds(statements);
  const { topLevel, idOnly } = idReferences(statements);
  const out: SymbolOccurrence[] = [];
  for (const s of symbols) {
    const names = idOnly.has(s.range.start) ? topLevel : defined;
    if (!ids.has(s.name)) {
      if (names.has(s.name)) out.push(s);
      continue;
    }
    const { start, end } = s.range;
    // The name as written, between its quotes when it has them; else (an escape) no symbol.
    const at = end - start === s.name.length ? start : start + 1;
    if (src.slice(at, at + s.name.length) !== s.name) continue;
    for (const part of parts(s.name, at, ids, names)) out.push(part);
  }
  // In place, one push at a time (a spread is unbounded on a large map).
  symbols.length = 0;
  for (const s of out) symbols.push(s);
}

/** Each pipeline component's node id, with its parent's name and its own (the first wins). */
function pipelineChildIds(statements: readonly WardleyStatementNode[]): ChildIds {
  const out = new Map<string, readonly [string, string]>();
  for (const n of statements) {
    if (n.type !== 'Pipeline') continue;
    for (const c of n.children) {
      const id = childId(n.parent.value, c.name.value);
      if (!out.has(id)) out.set(id, [n.parent.value, c.name.value]);
    }
  }
  return out;
}

/**
 * The names anchors and components declare outside pipelines, and where a name is read as a
 * node id only: the starts of the names after `pipeline`.
 */
function idReferences(statements: readonly WardleyStatementNode[]): {
  topLevel: ReadonlySet<string>;
  idOnly: ReadonlySet<number>;
} {
  const topLevel = new Set<string>();
  const idOnly = new Set<number>();
  for (const n of statements) {
    if (n.type === 'Anchor' || n.type === 'Component') topLevel.add(n.name.value);
    else if (n.type === 'Pipeline') idOnly.add(n.parent.range.start);
  }
  return { topLevel, idOnly };
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
