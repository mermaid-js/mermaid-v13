import { describe, expect, it } from 'vitest';
import { detectBlock, language, parseBlock } from '@mermaid-js/diagram-block/language';
import type { BlockStatementNode } from '@mermaid-js/diagram-block/language';
import type { Range } from '@mermaid-js/core/parser-kit';
import { createLanguageService } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
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

describe('block symbols, folding and rename through the service match v12', () => {
  it('over the corpus and cases', async () => {
    const oracle = await loadOracle();
    const service = createLanguageService({
      facets: [
        { type: 'block', id: 'block', detector: (src) => detectBlock(src), facet: language },
      ],
    });
    await service.preload({ types: ['block'] });
    const problems: string[] = [];
    const n = { checked: 0, ids: 0, refs: 0, classes: 0, folds: 0, renamed: 0, clashes: 0 };
    for (const item of [...(await blockCorpus()), ...blockCases()]) {
      const v12 = await oracle.parse(item.source);
      if (!v12.accepted || !BLOCK_V12_TYPES.includes(v12.diagramType)) continue;
      const snap = blockV12Snapshot(v12.db);
      try {
        if (
          JSON.stringify(blockV13Snapshot(parseBlockForParity(item.source))) !==
          JSON.stringify(snap)
        )
          continue;
      } catch {
        continue;
      }
      const doc = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'block') continue;
      n.checked++;
      const fail = (what: string) => problems.push(`${item.id}: ${what}`);
      const parsed = parseBlock(item.source);
      const at = (s: { range: Range }) => doc.text.slice(s.range.start, s.range.end);

      const ids = [...new Set(flat(snap.blocks).map((b) => b.id))].filter(
        (id) => !/^id-\d+/.test(id)
      );
      const written = (id: string) =>
        parsed.symbols.filter((s) => s.kind === 'block' && s.name === id && at(s) === id);
      for (const id of ids) {
        const occurrences = written(id).map((s) => s.range);
        // An id v12 decodes from an entity (`#35;`) is not written as itself: no symbol to check.
        if (occurrences.length === 0) continue;
        n.ids++;
        const first = [...occurrences].sort((a, b) => a.start - b.start)[0]!;
        const lists = new Set<string>();
        for (const o of occurrences) {
          const d = doc.definition(o.start);
          if (key(d) !== key(first)) fail(`block ${id} @${o.start}: definition ${key(d)}`);
          const refs = doc.references(o.start);
          lists.add(refs.map(key).join(' '));
          if (refs.length !== occurrences.length)
            fail(`block ${id} @${o.start}: ${refs.length} references of ${occurrences.length}`);
        }
        if (lists.size !== 1) fail(`block ${id}: references differ by occurrence`);
        if (occurrences.length > 1) n.refs++;
      }

      for (const c of snap.classes) {
        const all = parsed.symbols.filter((s) => s.kind === 'class' && s.name === c.id);
        const def = all.find((s) => s.role === 'def');
        if (!def) {
          fail(`class ${c.id} has no classDef occurrence`);
          continue;
        }
        n.classes++;
        for (const s of all) {
          const d = doc.definition(s.range.start);
          if (key(d) !== key(def.range))
            fail(`class ${c.id} @${s.range.start}: definition ${key(d)}`);
        }
      }

      const lineOf = (offset: number) => doc.text.slice(0, offset).split('\n').length;
      const folds = doc.foldingRanges().filter((f) => f.kind === 'composite');
      for (const s of statements(parsed.ast.children)) {
        if (s.type !== 'Composite' || s.name === undefined) continue;
        const body = statements(s.children);
        const later = body.filter((b) => lineOf(b.range.start) > lineOf(s.range.start));
        if (later.length === 0) continue;
        n.folds++;
        const f = folds.find((x) => x.range.start === s.range.start);
        if (!f) {
          fail(`composite ${s.name} has no fold`);
          continue;
        }
        for (const b of later)
          if (!inside(b.range, f.range)) fail(`composite ${s.name}: ${b.id} outside`);
      }

      const mentions = statements(parsed.ast.children);
      for (const id of ids) {
        const occurrences = written(id);
        if (occurrences.length === 0) continue;
        const o = occurrences[0]!.range.start;
        const other = ids.find((x) => x !== id && written(x).length > 0);
        if (other !== undefined) {
          const clash = doc.rename(o, other);
          if (!('refused' in clash)) fail(`block ${id}: rename to ${other} not refused`);
          else n.clashes++;
        }
        if (item.source.includes(FRESH)) continue;
        const result = doc.rename(o, FRESH);
        if ('refused' in result) {
          fail(`block ${id}: rename refused: ${result.refused}`);
          continue;
        }
        const after = await oracle.parse(apply(item.source, result.edits));
        if (!after.accepted) {
          fail(`block ${id}: v12 rejects the renamed text`);
          continue;
        }
        const labelled = mentions.some(
          (m) =>
            (m.type === 'Block' || m.type === 'Composite') && m.name === id && m.label !== undefined
        );
        const composite = flat(snap.blocks).some((b) => b.id === id && b.type === 'composite');
        const want = renamed(snap, id, FRESH, !labelled && !composite);
        if (JSON.stringify(blockV12Snapshot(after.db)) !== JSON.stringify(want))
          fail(`block ${id}: rename changes more than the id`);
        else n.renamed++;
      }
    }
    expect(problems).toEqual([]);
    expect(n.checked).toBeGreaterThan(200);
    expect(n.ids).toBeGreaterThan(600);
    expect(n.refs).toBeGreaterThan(60);
    expect(n.classes).toBeGreaterThan(8);
    expect(n.folds).toBeGreaterThan(60);
    expect(n.renamed).toBe(n.ids);
    expect(n.clashes).toBeGreaterThan(550);
  }, 300_000);
});
