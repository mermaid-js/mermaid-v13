import { beforeAll, describe, expect, it } from 'vitest';
import { detectBlock, language, parseBlock } from '@mermaid-js/diagram-block/language';
import type { BlockParseResult, BlockStatementNode } from '@mermaid-js/diagram-block/language';
import type { Range } from '@mermaid-js/core/parser-kit';
import { createLanguageService } from '@mermaid-js/language-service';
import type { DocumentSnapshot } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
import type { Oracle } from '../oracle.ts';
import { blockCases, blockCorpus } from './corpus.ts';
import { BLOCK_V12_TYPES, blockV12Snapshot } from './v12.ts';
import type { BlockSnapshot, BlockSnapshotNode } from './v12.ts';
import { blockV13Snapshot, parseBlockForParity } from './v13.ts';

/**
 * The oracle expectations re-run through the language service for block (language.md step 8,
 * D99 suite 2, R-LANG-1, D448, #557), checked against the mermaid v12 DB over the block corpus
 * and cases, on every source v12 accepts whose model v13 reads as v12 does:
 * - every v12 block id written in the source resolves, from each of its occurrences, to one
 *   definition, its first occurrence by offset, and references from any occurrence give the
 *   same list, all of them (`class` and `style` targets included);
 * - every v12 class (`classDef`) has a definition at its first `classDef`, and its `class`
 *   uses refer to it;
 * - each composite with an id whose body holds a block on a later line folds from its
 *   `block:` over that body;
 * - renaming each block id to a fresh one, v12 reads the new text with that id changed (in
 *   blocks, edges, edge ids, and the label of a block written without one) and nothing else;
 *   renaming it to another block's id is refused.
 *
 * The manifest (#558) is not there yet, so the facet is given to the service as a row of its
 * own; once it is, the row only replaces the generated one.
 */
const FRESH = 'renamedZq7';
const key = (r: Range | undefined) => (r ? `${r.start}:${r.end}` : 'none');
const inside = (r: Range, outer: Range) => outer.start <= r.start && r.end <= outer.end;

function apply(text: string, edits: readonly { range: Range; newText: string }[]): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.range.start - a.range.start))
    out = out.slice(0, e.range.start) + e.newText + out.slice(e.range.end);
  return out;
}

function flat(blocks: readonly BlockSnapshotNode[]): BlockSnapshotNode[] {
  return blocks.flatMap((b) => [b, ...flat(b.children)]);
}

/** `snap` with block `from` renamed `to`; `relabel`: its label was its id (none written). */
function renamed(snap: BlockSnapshot, from: string, to: string, relabel: boolean): BlockSnapshot {
  const id = (v: string | null) => (v === from ? to : v);
  const node = (b: BlockSnapshotNode): BlockSnapshotNode => ({
    ...b,
    id: b.id === from ? to : b.id,
    label: relabel && b.id === from ? to : b.label,
    children: b.children.map(node),
  });
  return {
    ...snap,
    blocks: snap.blocks.map(node),
    edges: snap.edges.map((e) => {
      const [k] = e.id.split('-');
      const start = id(e.start);
      const end = id(e.end);
      return { ...e, id: `${k}-${start}-${end}`, start, end };
    }),
  };
}

/** Every AST statement of `nodes`, bodies included. */
function statements(nodes: readonly BlockStatementNode[]): BlockStatementNode[] {
  return nodes.flatMap((n) => (n.type === 'Composite' ? [n, ...statements(n.children)] : [n]));
}

/** A corpus source v12 accepts and v13 reads as v12 does, with what the checks read of it. */
interface Case {
  id: string;
  source: string;
  snap: BlockSnapshot;
  doc: DocumentSnapshot;
  parsed: BlockParseResult;
  /** The v12 block ids written in the source as themselves, and their occurrences. */
  ids: Map<string, Range[]>;
}

let oracle: Oracle;
const cases: Case[] = [];

beforeAll(async () => {
  oracle = await loadOracle();
  const service = createLanguageService({
    facets: [{ type: 'block', id: 'block', detector: (src) => detectBlock(src), facet: language }],
  });
  await service.preload({ types: ['block'] });
  for (const item of [...(await blockCorpus()), ...blockCases()]) {
    const v12 = await oracle.parse(item.source);
    if (!v12.accepted || !BLOCK_V12_TYPES.includes(v12.diagramType)) continue;
    const snap = blockV12Snapshot(v12.db);
    try {
      const mine = blockV13Snapshot(parseBlockForParity(item.source));
      if (JSON.stringify(mine) !== JSON.stringify(snap)) continue;
    } catch {
      continue;
    }
    const doc = service.update(`corpus:///${item.id}`, item.source);
    if (doc.facet?.id !== 'block') continue;
    const parsed = parseBlock(item.source);
    const ids = new Map<string, Range[]>();
    for (const b of flat(snap.blocks)) {
      if (/^id-\d+/.test(b.id) || ids.has(b.id)) continue;
      // An id v12 decodes from an entity (`#35;`) is not written as itself: no symbol to check.
      const at = parsed.symbols
        .filter((s) => s.kind === 'block' && s.name === b.id)
        .filter((s) => item.source.slice(s.range.start, s.range.end) === b.id)
        .map((s) => s.range);
      if (at.length > 0) ids.set(b.id, at);
    }
    cases.push({ id: item.id, source: item.source, snap, doc, parsed, ids });
  }
}, 300_000);

describe('block symbols, folding and rename through the service match v12', () => {
  it('reads enough of the corpus', () => {
    expect(cases.length).toBeGreaterThan(200);
    expect(cases.reduce((n, c) => n + c.ids.size, 0)).toBeGreaterThan(600);
  });

  it('gives each block id one definition, its first occurrence, and all its occurrences as references', () => {
    const problems: string[] = [];
    let repeated = 0;
    for (const { id, doc, ids } of cases) {
      for (const [name, occurrences] of ids) {
        const first = [...occurrences].sort((a, b) => a.start - b.start)[0]!;
        const lists = new Set<string>();
        for (const o of occurrences) {
          const d = doc.definition(o.start);
          if (key(d) !== key(first))
            problems.push(`${id}: ${name} @${o.start}: definition ${key(d)}`);
          const refs = doc.references(o.start);
          lists.add(refs.map(key).join(' '));
          if (refs.length !== occurrences.length)
            problems.push(`${id}: ${name} @${o.start}: ${refs.length} of ${occurrences.length}`);
        }
        if (lists.size !== 1) problems.push(`${id}: ${name}: references differ by occurrence`);
        if (occurrences.length > 1) repeated++;
      }
    }
    expect(problems).toEqual([]);
    expect(repeated).toBeGreaterThan(60);
  });

  it('defines each class at its first classDef', () => {
    const problems: string[] = [];
    let classes = 0;
    for (const { id, doc, parsed, snap } of cases) {
      for (const c of snap.classes) {
        const all = parsed.symbols.filter((s) => s.kind === 'class' && s.name === c.id);
        const def = all.find((s) => s.role === 'def');
        if (!def) {
          problems.push(`${id}: class ${c.id} has no classDef occurrence`);
          continue;
        }
        classes++;
        for (const s of all) {
          const d = doc.definition(s.range.start);
          if (key(d) !== key(def.range))
            problems.push(`${id}: class ${c.id} @${s.range.start}: definition ${key(d)}`);
        }
      }
    }
    expect(problems).toEqual([]);
    expect(classes).toBeGreaterThan(8);
  });

  it('folds each composite with an id over the body on its later lines', () => {
    const problems: string[] = [];
    let folds = 0;
    for (const { id, doc, parsed } of cases) {
      const lineOf = (offset: number) => doc.text.slice(0, offset).split('\n').length;
      const ranges = doc.foldingRanges();
      if (
        ranges.some(
          (f) => f.kind !== 'composite' && f.kind !== 'frontMatter' && f.kind !== 'directive'
        )
      )
        problems.push(`${id}: a fold that is no composite`);
      for (const s of statements(parsed.ast.children)) {
        if (s.type !== 'Composite' || s.name === undefined) continue;
        const later = statements(s.children).filter(
          (b) => lineOf(b.range.start) > lineOf(s.range.start)
        );
        if (later.length === 0) continue;
        folds++;
        const f = ranges.find((x) => x.kind === 'composite' && x.range.start === s.range.start);
        if (!f) problems.push(`${id}: composite ${s.name} has no fold`);
        else
          for (const b of later)
            if (!inside(b.range, f.range)) problems.push(`${id}: ${s.name}: ${b.id} outside`);
      }
    }
    expect(problems).toEqual([]);
    expect(folds).toBeGreaterThan(60);
  });

  it('renames each block id so that v12 reads the new text with only that id changed', async () => {
    const problems: string[] = [];
    let done = 0;
    for (const { id, source, doc, parsed, snap, ids } of cases) {
      if (source.includes(FRESH)) continue;
      const mentions = statements(parsed.ast.children);
      for (const [name, occurrences] of ids) {
        const result = doc.rename(occurrences[0]!.start, FRESH);
        if ('refused' in result) {
          problems.push(`${id}: ${name}: rename refused: ${result.refused}`);
          continue;
        }
        const after = await oracle.parse(apply(source, result.edits));
        if (!after.accepted) {
          problems.push(`${id}: ${name}: v12 rejects the renamed text`);
          continue;
        }
        const labelled = mentions.some(
          (m) =>
            (m.type === 'Block' || m.type === 'Composite') &&
            m.name === name &&
            m.label !== undefined
        );
        const composite = flat(snap.blocks).some((b) => b.id === name && b.type === 'composite');
        const want = renamed(snap, name, FRESH, !labelled && !composite);
        if (JSON.stringify(blockV12Snapshot(after.db)) !== JSON.stringify(want))
          problems.push(`${id}: ${name}: rename changes more than the id`);
        else done++;
      }
    }
    expect(problems).toEqual([]);
    expect(done).toBeGreaterThan(600);
  }, 300_000);

  it("refuses to rename a block id to another block's id", () => {
    const problems: string[] = [];
    let refused = 0;
    for (const { id, doc, ids } of cases) {
      const names = [...ids.keys()];
      for (const [name, occurrences] of ids) {
        const other = names.find((x) => x !== name);
        if (other === undefined) continue;
        const clash = doc.rename(occurrences[0]!.start, other);
        if ('refused' in clash) refused++;
        else problems.push(`${id}: ${name}: rename to ${other} not refused`);
      }
    }
    expect(problems).toEqual([]);
    expect(refused).toBeGreaterThan(550);
  });
});
