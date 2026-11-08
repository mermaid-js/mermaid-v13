import { describe, expect, it } from 'vitest';
import { detectVenn } from '@mermaid-js/diagram-venn';
import type { VennStatementNode } from '@mermaid-js/diagram-venn';
import { parseVenn, vennLanguage } from '@mermaid-js/diagram-venn/language';
import type { Range, SymbolOccurrence } from '@mermaid-js/core/parser-kit';
import { createLanguageService, firstPartyFacets } from '@mermaid-js/language-service';
import type { DocumentSnapshot } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
import { vennGateCorpus } from './corpus.ts';
import { VENN_V12_TYPES, vennV12Snapshot } from './v12.ts';
import type { VennSnapshot } from './v12.ts';
import { parseVennForParity, vennV13Snapshot } from './v13.ts';

/**
 * The oracle expectations re-run through the language service for venn (language.md step 8,
 * D99 suite 2, R-LANG-1, D418, #498), checked against the mermaid v12 DB over the venn gate
 * corpus, on every source v12 accepts and whose model v13 reads as v12 does (the listed parity
 * divergences are left out):
 * - every v12 set resolves, from each of its occurrences (`set`, `union`, `text`, `style`), to
 *   one definition, the id of its first `set` statement, and references from any occurrence
 *   give the same list, all of them; an id no `set` declares has no definition;
 * - every v12 text node id resolves to its first `text` statement the same way;
 * - a one-id `style` target is a set when v12 has a set of that id, else a text node when v12
 *   has one, else a set (v12's renderer looks the target up in that order);
 * - each `set` or `union` followed by indented `text` lines folds over exactly those lines, and
 *   v12 gives each of them that statement's sets;
 * - renaming a set to a fresh id, and a text node to a fresh id that must be quoted, v12 reads
 *   the new text with that id changed and nothing else; renaming a set to another set's id is
 *   refused.
 *
 * The empty id `set ""` is left out: an occurrence with no text has nothing to point at.
 *
 * The service gets the facet as an eager row, as a host bundling it would, until venn's
 * manifest has its `language` entry (#501); the last test then fails: drop the row.
 */
const service = createLanguageService({
  facets: [{ type: 'venn', id: 'venn', detector: (t) => detectVenn(t), facet: vennLanguage }],
});

const FRESH = 'renamedZq7';
const FRESH_QUOTED = 'renamed Zq7';
const key = (r: Range | undefined) => (r ? `${r.start}:${r.end}` : 'none');
const inside = (r: Range, outer: Range) => outer.start <= r.start && r.end <= outer.end;

function apply(text: string, edits: readonly { range: Range; newText: string }[]): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.range.start - a.range.start))
    out = out.slice(0, e.range.start) + e.newText + out.slice(e.range.end);
  return out;
}

/**
 * The text a symbol occurrence names: its range, or inside its quotes. None for the empty id
 * (`set ""`, which v12 takes): the service has no text to put a cursor on (GAPS #498).
 */
function inner(text: string, s: SymbolOccurrence): Range | undefined {
  const { start, end } = s.range;
  if (s.name === '') return undefined;
  if (text.slice(start, end) === s.name) return s.range;
  if (text.charAt(start) === '"' && text.slice(start + 1, end - 1) === s.name)
    return { start: start + 1, end: end - 1 };
  return undefined;
}

/** `snap` with every id list sorted, the title left out (parity compares it). */
function ids(snap: VennSnapshot): unknown {
  return {
    subsets: snap.subsets.map(([sets, size, label]) => [[...sets].sort(), size, label]),
    textNodes: snap.textNodes.map(([sets, id, label]) => [[...sets].sort(), id, label]),
    styles: snap.styles.map(([targets, props]) => [[...targets].sort(), props]),
  };
}

/** `snap` with set `from` renamed `to`. */
function renameSet(snap: VennSnapshot, from: string, to: string): VennSnapshot {
  const map = (list: readonly string[]) => list.map((n) => (n === from ? to : n));
  return {
    ...snap,
    subsets: snap.subsets.map(([sets, size, label]) => [map(sets), size, label]),
    textNodes: snap.textNodes.map(([sets, id, label]) => [map(sets), id, label]),
    styles: snap.styles.map(([targets, props]) =>
      // A one-id target names the set first; a text node of that id keeps it otherwise.
      [targets.length === 1 || targets.includes(from) ? map(targets) : targets, props]
    ),
  };
}

/** `snap` with text node `from` renamed `to` (and the one-id styles that name it). */
function renameText(snap: VennSnapshot, sets: Set<string>, from: string, to: string) {
  return {
    ...snap,
    textNodes: snap.textNodes.map(([s, id, label]) => [s, id === from ? to : id, label]),
    styles: snap.styles.map(([targets, props]) => [
      targets.length === 1 && targets[0] === from && !sets.has(from) ? [to] : targets,
      props,
    ]),
  } as VennSnapshot;
}

describe('venn symbols, folding and rename through the service match v12', () => {
  it('over the gate corpus', async () => {
    const oracle = await loadOracle();
    const problems: string[] = [];
    const n = { checked: 0, sets: 0, undeclared: 0, texts: 0, styles: 0, folds: 0 };
    const r = { sets: 0, texts: 0, clashes: 0 };
    for (const item of await vennGateCorpus()) {
      const v12 = await oracle.parse(item.source);
      if (!v12.accepted || !VENN_V12_TYPES.includes(v12.diagramType)) continue;
      const snap = vennV12Snapshot(v12.db);
      let mine: unknown;
      try {
        mine = ids(vennV13Snapshot(parseVennForParity(item.source)));
      } catch {
        continue;
      }
      if (JSON.stringify(mine) !== JSON.stringify(ids(snap))) continue;
      const doc: DocumentSnapshot = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'venn') continue;
      n.checked++;
      const fail = (what: string) => problems.push(`${item.id}: ${what}`);
      const text = doc.text;
      const parsed = parseVenn(text, { keepTokens: true });
      const nodes: VennStatementNode[] = parsed.ast.children;
      const kept = (kind: string, name: string) =>
        parsed.symbols
          .filter((s) => s.kind === kind && s.name === name)
          .map((s) => inner(text, s))
          .filter((x): x is Range => x !== undefined);
      const all = (kind: string, name: string) =>
        parsed.symbols.filter((s) => s.kind === kind && s.name === name).length;

      // One definition and one reference list per symbol, from every occurrence.
      const resolves = (kind: string, name: string, def: Range | undefined) => {
        const at = kept(kind, name);
        if (at.length === 0) return false;
        for (const o of at) {
          const d = doc.definition(o.start);
          if (key(d) !== key(def)) fail(`${kind} ${name}: definition ${key(d)}, want ${key(def)}`);
        }
        const lists = new Set(at.map((o) => doc.references(o.start).map(key).join(' ')));
        if (lists.size !== 1) fail(`${kind} ${name}: references differ by occurrence`);
        const refs = doc.references(at[0]!.start);
        if (refs.length !== at.length) fail(`${kind} ${name}: ${refs.length} of ${at.length}`);
        return true;
      };
      const setNames = new Set(snap.subsets.filter(([s]) => s.length === 1).map(([s]) => s[0]!));
      for (const name of setNames) {
        const first = nodes.find((x) => x.type === 'Set' && x.name.name === name);
        const def =
          first?.type === 'Set'
            ? inner(text, { ...first.name, kind: 'set', role: 'def' })
            : undefined;
        if (resolves('set', name, def)) n.sets++;
      }
      const named = new Set([
        ...snap.textNodes.flatMap(([s]) => s),
        ...snap.styles.flatMap(([t]) => (t.length > 1 ? t : [])),
      ]);
      for (const name of named) {
        if (setNames.has(name)) continue;
        if (resolves('set', name, undefined)) n.undeclared++;
      }
      const textIds = new Set(snap.textNodes.map(([, id]) => id));
      for (const name of textIds) {
        const first = nodes.find((x) => x.type === 'Text' && x.name.name === name);
        const def =
          first?.type === 'Text'
            ? inner(text, { ...first.name, kind: 'text', role: 'def' })
            : undefined;
        if (resolves('text', name, def)) n.texts++;
      }
      // A one-id style target: a set first, then a text node.
      for (const node of nodes) {
        if (node.type !== 'Style' || node.targets.length !== 1) continue;
        const t = node.targets[0]!;
        const want = !setNames.has(t.name) && textIds.has(t.name) ? 'text' : 'set';
        const s = parsed.symbols.find((x) => x.range.start === t.range.start);
        if (s?.kind !== want) fail(`style ${t.name}: a ${s?.kind} reference, want ${want}`);
        else n.styles++;
      }

      // Folding: a `set` or `union` with its indented `text` lines; v12 gives them its sets.
      const folds = doc.foldingRanges();
      const lineOf = (o: number) => text.slice(0, o).split(/\r\n?|\n/).length;
      let subset = -1;
      let textNode = -1;
      nodes.forEach((node, k) => {
        if (node.type === 'Set' || node.type === 'Union') subset++;
        if (node.type === 'Text') textNode++;
        if (node.type !== 'Set' && node.type !== 'Union') return;
        let last = k;
        while (
          nodes[last + 1]?.type === 'Text' &&
          (nodes[last + 1] as { indented: boolean }).indented
        )
          last++;
        for (let j = k + 1, t = textNode + 1; j <= last; j++, t++) {
          const v = snap.textNodes[t]?.[0];
          if (JSON.stringify(v) !== JSON.stringify(snap.subsets[subset]?.[0]))
            fail(`text ${snap.textNodes[t]?.[1]}: v12 sets ${JSON.stringify(v)}`);
        }
        if (last === k || lineOf(nodes[last]!.range.end) === lineOf(node.range.start)) return;
        n.folds++;
        const f = folds.find((x) => x.range.start === node.range.start);
        if (!f) return fail(`${node.id} has no fold`);
        for (let j = k + 1; j <= last; j++)
          if (!inside(nodes[j]!.range, f.range))
            fail(`${node.id}: ${nodes[j]!.id} outside its fold`);
        const next = nodes[last + 1];
        if (next && next.range.start < f.range.end) fail(`${node.id}: its fold holds ${next.id}`);
      });

      // Rename, read back by v12.
      const readBack = async (edits: readonly { range: Range; newText: string }[]) => {
        const after = await oracle.parse(apply(text, edits));
        return after.accepted ? ids(vennV12Snapshot(after.db)) : undefined;
      };
      for (const name of setNames) {
        const at = kept('set', name);
        if (at.length === 0 || at.length !== all('set', name)) continue;
        const renamed = doc.rename(at[0]!.start, FRESH);
        if ('refused' in renamed) {
          fail(`set ${name}: rename refused: ${renamed.refused}`);
          continue;
        }
        const got = await readBack(renamed.edits);
        if (JSON.stringify(got) !== JSON.stringify(ids(renameSet(snap, name, FRESH))))
          fail(`set ${name}: the rename changes more than the id`);
        else r.sets++;
        const other = [...setNames].find((x) => x !== name);
        if (other !== undefined) {
          const clash = doc.rename(at[0]!.start, other);
          if (!('refused' in clash)) fail(`set ${name}: renamed to the existing ${other}`);
          else r.clashes++;
        }
      }
      for (const name of textIds) {
        const at = kept('text', name);
        if (at.length === 0 || at.length !== all('text', name)) continue;
        const renamed = doc.rename(at[0]!.start, FRESH_QUOTED);
        if ('refused' in renamed) {
          fail(`text ${name}: rename refused: ${renamed.refused}`);
          continue;
        }
        const got = await readBack(renamed.edits);
        if (
          JSON.stringify(got) !==
          JSON.stringify(ids(renameText(snap, setNames, name, FRESH_QUOTED)))
        )
          fail(`text ${name}: the rename changes more than the id`);
        else r.texts++;
      }
    }
    expect(problems).toEqual([]);
    expect(n.checked).toBeGreaterThan(800);
    expect(n.sets).toBeGreaterThan(1500);
    expect(n.undeclared).toBeGreaterThan(5);
    expect(n.texts).toBeGreaterThan(200);
    expect(n.styles).toBeGreaterThan(100);
    expect(n.folds).toBeGreaterThan(100);
    expect(r.sets).toBeGreaterThan(1000);
    expect(r.texts).toBeGreaterThan(200);
    expect(r.clashes).toBeGreaterThan(500);
    process.stdout.write(`venn service symbols: ${JSON.stringify({ ...n, renamed: r })}\n`);
  }, 600_000);

  it('the facet is not in the generated registry yet (#501: drop the eager row then)', () => {
    expect(firstPartyFacets.find((e) => e.type === 'venn')?.load).toBeUndefined();
  });
});
