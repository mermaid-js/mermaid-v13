import { describe, expect, it } from 'vitest';
import { sankeyLanguage, SankeyTokenKind, sankeyTokens } from '@mermaid-js/diagram-sankey/language';
import type { Range } from '@mermaid-js/core/parser-kit';
import { createLanguageService, firstPartyFacets } from '@mermaid-js/language-service';
import type { DocumentSnapshot } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
import { sankeyGateCorpus } from './corpus.ts';
import { sankeyV12Snapshot } from './v12.ts';
import type { SankeySnapshot } from './v12.ts';

/**
 * The oracle expectations re-run through the language service for sankey (language.md step 8,
 * D99 suite 2, R-LANG-1, #504), checked against the mermaid v12 DB over the sankey gate corpus
 * (every source v12 accepts and v13 reads without an error):
 * - names (D398): the service's `node` names are v12's nodes; every occurrence it keeps of a
 *   name has the first as its definition and the same references, as many as the fields of
 *   v12's links that name it (all of them, but those the service drops: a name v12 read from
 *   other text than the source holds, as a CRLF or a directive inside it);
 * - rename: each node renamed to a plain name, and to one that needs quotes and doubling
 *   (`a, "b"`), reads back in v12 as the same graph with only that name changed; the rename
 *   of a name with a dropped occurrence is refused (among them, every name on a line v12 may
 *   rewrite: `style,b,1 :#f;`, whose last `;` v12 drops only while the line holds `style`);
 * - folding: the body folds from `sankey` over every row v12 read.
 *
 * The service loads the facet through the generated registry row (sankey's manifest
 * `language` entry, #503).
 */
const service = createLanguageService();
await service.preload({ types: ['sankey'] });

const key = (r: Range) => `${r.start}:${r.end}`;

const PLAIN = 'renamedZq7';
const QUOTED = 'renamed, "Zq7"';

function apply(text: string, edits: readonly { range: Range; newText: string }[]): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.range.start - a.range.start))
    out = out.slice(0, e.range.start) + e.newText + out.slice(e.range.end);
  return out;
}

/** v12's graph with `from` named `to`. */
function renamed(graph: SankeySnapshot, from: string, to: string): string {
  const name = (n: string) => (n === from ? to : n);
  return JSON.stringify({
    nodes: graph.nodes.map((n) => ({ id: name(n.id) })),
    links: graph.links.map((l) => ({ ...l, source: name(l.source), target: name(l.target) })),
  });
}

/** How many fields of v12's links name each node. */
function fieldCounts(graph: SankeySnapshot): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of graph.links)
    for (const n of [l.source, l.target]) out.set(n, (out.get(n) ?? 0) + 1);
  return out;
}

/** The first occurrence of each name the service keeps, by name. */
function firstOccurrences(doc: DocumentSnapshot, names: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const name of names) {
    const s = doc.facet && parsedSymbols(doc).find((x) => x.name === name);
    if (s && 'range' in doc.prepareRename(s.range.start + 1)) out.set(name, s.range.start + 1);
  }
  return out;
}

const parsedSymbols = (doc: DocumentSnapshot) =>
  sankeyLanguage.parse(doc.text, { keepTokens: true }).symbols;

describe('sankey symbols, rename and folding through the service match v12', () => {
  it('over the gate corpus', async () => {
    const oracle = await loadOracle();
    const problems: string[] = [];
    let checked = 0;
    let names = 0;
    let repeated = 0;
    let dropped = 0;
    let renames = 0;
    let refusals = 0;
    let folds = 0;
    for (const item of await sankeyGateCorpus()) {
      const v12 = await oracle.parse(item.source);
      if (!v12.accepted || v12.diagramType !== 'sankey') continue;
      const doc = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'sankey') continue;
      if (doc.diagnostics().some((d) => d.severity === 'error')) continue;
      checked++;
      const fail = (what: string) => problems.push(`${item.id}: ${what}`);
      const graph = sankeyV12Snapshot(v12.db);
      const counts = fieldCounts(graph);
      const symbols = parsedSymbols(doc);
      const v12Names = graph.nodes.map((n) => n.id);
      const ours = [...new Set(symbols.map((s) => s.name))];
      if (JSON.stringify(ours) !== JSON.stringify(v12Names)) fail('names differ from v12 nodes');

      const firsts = firstOccurrences(doc, v12Names);
      for (const name of v12Names) {
        names++;
        const mine = symbols.filter((s) => s.name === name);
        if (mine.length !== counts.get(name)) fail(`${name}: ${mine.length} occurrences`);
        if (mine.length > 1) repeated++;
        const at = firsts.get(name);
        if (at === undefined) {
          dropped++;
          continue;
        }
        const refs = doc.references(at, true).map(key).join(' ');
        const def = doc.definition(at);
        for (const s of mine) {
          const there = s.range.start + 1;
          if (!('range' in doc.prepareRename(there))) continue;
          if (def && key(doc.definition(there) ?? def) !== key(def)) fail(`${name}: definition`);
          if (doc.references(there, true).map(key).join(' ') !== refs) fail(`${name}: references`);
        }
        const kept = refs.split(' ').length;
        for (const to of [PLAIN, QUOTED]) {
          const result = doc.rename(at, to);
          if ('refused' in result) {
            if (kept === mine.length) fail(`${name} -> ${to}: refused: ${result.refused}`);
            else refusals++;
            continue;
          }
          if (kept !== mine.length) fail(`${name} -> ${to}: renamed with a dropped occurrence`);
          renames++;
          const back = await oracle.parse(apply(item.source, result.edits));
          if (!back.accepted) fail(`${name} -> ${to}: v12 rejects the renamed text`);
          else if (JSON.stringify(sankeyV12Snapshot(back.db)) !== renamed(graph, name, to))
            fail(`${name} -> ${to}: v12 reads another graph`);
        }
      }

      // The body folds from `sankey` when a name is on a later line, over every name.
      const header = sankeyTokens(item.source).find((t) => t.kind === SankeyTokenKind.Sankey);
      const last = symbols.reduce((end, s) => Math.max(end, s.range.end), 0);
      if (!header || !/[\r\n]/.test(item.source.slice(header.range.start, last))) continue;
      folds++;
      const fold = doc.foldingRanges().find((f) => f.kind === 'sankey');
      if (fold?.range.start !== header.range.start) fail('no body fold at `sankey`');
      else if (fold.range.end < last) fail('the body fold ends before the last name');
    }
    expect(problems).toEqual([]);
    expect(checked).toBeGreaterThan(600);
    expect(names).toBeGreaterThan(3000);
    expect(repeated).toBeGreaterThan(900);
    expect(dropped).toBeGreaterThan(0);
    expect(renames).toBeGreaterThan(5000);
    expect(refusals).toBeGreaterThan(0);
    expect(folds).toBeGreaterThan(600);
  }, 600_000);

  it('loads the sankey facet from the generated registry row', () => {
    const row = firstPartyFacets.find((e) => e.type === 'sankey');
    expect(row?.load).toBeDefined();
    expect(service.update('x:///s', 'sankey\na,b,1\n').facet?.id).toBe('sankey');
  });
});
