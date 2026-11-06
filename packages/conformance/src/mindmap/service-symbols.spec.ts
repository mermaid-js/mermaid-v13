import { describe, expect, it } from 'vitest';
import { detectMindmap, parseMindmap } from '@mermaid-js/diagram-mindmap';
import { mindmapLanguage } from '@mermaid-js/diagram-mindmap/language';
import type { Range } from '@mermaid-js/core/parser-kit';
import { createLanguageService, firstPartyFacets } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
import { mindmapGateCorpus } from './corpus.ts';
import { classWords, mindmapV12Snapshot } from './v12.ts';

/**
 * The oracle expectations re-run through the language service for mindmap (language.md
 * step 8, D99 suite 2, R-LANG-1, #389), checked against the mermaid v12 DB over the mindmap
 * gate corpus:
 * - node ids (D289): every v12 node written with an id has exactly one `node` occurrence, its
 *   id without the blanks around it; its definition is that occurrence and its references are
 *   that occurrence alone, also when another node has the same id;
 * - classes: every class v12 gives a node has occurrences, all resolving to one definition
 *   with the same references from each, and the class line v12 kept for the node is among them;
 * - folding per subtree: every v12 node with a child on a later line has a `node` fold starting
 *   at it that holds its whole subtree and no node after it.
 *
 * The service gets the facet as an eager row, as a host bundling it would, until mindmap's
 * manifest has its `language` entry (#390); the last test then fails: drop the row.
 */
const service = createLanguageService({
  facets: [
    {
      type: 'mindmap',
      id: 'mindmap',
      detector: (t) => detectMindmap(t),
      facet: mindmapLanguage,
    },
  ],
});

const inside = (r: Range, outer: Range) => outer.start <= r.start && r.end <= outer.end;
const key = (r: Range) => `${r.start}:${r.end}`;

describe('mindmap symbols and folding through the service match v12', () => {
  it('over the gate corpus', async () => {
    const oracle = await loadOracle();
    const problems: string[] = [];
    let checked = 0;
    let repeats = 0;
    let classes = 0;
    let folds = 0;
    for (const item of await mindmapGateCorpus()) {
      const v12 = await oracle.parse(item.source);
      if (!v12.accepted || v12.diagramType !== 'mindmap') continue;
      const doc = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'mindmap') continue;
      if (doc.diagnostics().some((d) => d.severity === 'error')) continue;
      checked++;
      const fail = (what: string) => problems.push(`${item.id}: ${what}`);
      const model = mindmapV12Snapshot(v12.db);
      const parsed = parseMindmap(item.source);
      if (parsed.model.nodes.length !== model.nodes.length) {
        fail(`${parsed.model.nodes.length} nodes, v12 ${model.nodes.length}`);
        continue;
      }
      const astOf = new Map(parsed.ast.children.map((n) => [n.id, n]));
      const nodeSymbols = parsed.symbols.filter((s) => s.kind === 'node');
      const seen = new Map<string, number>();

      model.nodes.forEach((v, k) => {
        const ast = astOf.get(parsed.model.nodes[k]!.ast);
        if (!ast) return fail(`node ${k} has no AST node`);
        if (ast.nodeId === undefined || ast.nodeId.trim() === '') return;
        const name = v.id.trim();
        const mine = nodeSymbols.filter((s) => inside(s.range, ast.range));
        if (mine.length !== 1 || mine[0]!.name !== name) {
          return fail(`node ${name}: ${mine.length} occurrences`);
        }
        const at = mine[0]!.range;
        if (doc.text.slice(at.start, at.end) !== name) return;
        if ((seen.get(name) ?? 0) > 0) repeats++;
        seen.set(name, (seen.get(name) ?? 0) + 1);
        const d = doc.definition(at.start);
        if (!d || key(d) !== key(at)) fail(`node ${name}: definition ${d && key(d)}`);
        const refs = doc.references(at.start).map(key);
        if (refs.length !== 1 || refs[0] !== key(at))
          fail(`node ${name}: references ${refs.join(' ')}`);
        if (doc.references(at.start, false).length > 0) fail(`node ${name}: has references`);
      });

      const classSymbols = parsed.symbols.filter((s) => s.kind === 'class');
      for (const name of new Set(model.nodes.flatMap((v) => v.classes))) {
        const at = classSymbols.filter((s) => s.name === name);
        if (at.length === 0) {
          fail(`class ${name} has no occurrence`);
          continue;
        }
        classes++;
        const defs = new Set(at.map((s) => doc.definition(s.range.start)).map((d) => d && key(d)));
        if (defs.size !== 1 || defs.has(undefined)) fail(`class ${name}: ${defs.size} definitions`);
        const lists = new Set(at.map((s) => JSON.stringify(doc.references(s.range.start))));
        if (lists.size !== 1) fail(`class ${name}: references differ by occurrence`);
        const refs = doc.references(at[0]!.range.start);
        if (refs.length !== at.length) fail(`class ${name}: ${refs.length} of ${at.length}`);
      }
      model.nodes.forEach((v, k) => {
        if (v.classes.length === 0) return;
        const ast = astOf.get(parsed.model.nodes[k]!.ast);
        const lines = ast?.decorations.filter((d) => d.type === 'Class') ?? [];
        const kept = lines[lines.length - 1];
        if (!kept || classWords(kept.text).join(' ') !== v.classes.join(' '))
          fail(`node ${v.id}: v12 classes ${v.classes.join(' ')} are not its last class line`);
      });

      const ranges = doc.foldingRanges().filter((f) => f.kind === 'node');
      const starts = parsed.model.nodes.map((n) => astOf.get(n.ast)!.range);
      const subtreeEnd = (k: number): number => {
        let e = k;
        while (e + 1 < model.nodes.length) {
          let p = model.nodes[e + 1]!.parent;
          while (p > k) p = model.nodes[p]!.parent;
          if (p !== k) break;
          e++;
        }
        return e;
      };
      const lineOf = (offset: number) => doc.text.slice(0, offset).split('\n').length;
      model.nodes.forEach((v, k) => {
        const last = subtreeEnd(k);
        if (last === k || lineOf(starts[last]!.end) === lineOf(starts[k]!.start)) return;
        folds++;
        const f = ranges.find((x) => x.range.start === starts[k]!.start);
        if (!f) return fail(`node ${v.id} has no fold`);
        for (let d = k + 1; d <= last; d++) {
          if (!inside(starts[d]!, f.range)) fail(`node ${v.id}: ${model.nodes[d]!.id} outside`);
        }
        const next = starts[last + 1];
        if (next && next.start < f.range.end) fail(`node ${v.id}: fold holds a later node`);
      });
    }
    expect(checked).toBeGreaterThan(300);
    expect(repeats).toBeGreaterThan(10);
    expect(classes).toBeGreaterThan(20);
    expect(folds).toBeGreaterThan(300);
    expect(problems).toEqual([]);
  }, 300_000);

  it('runs with an eager row only while mindmap has no manifest `language` entry', () => {
    const row = firstPartyFacets.find((e) => e.type === 'mindmap');
    expect(row?.load, 'drop the eager row: the manifest registers the facet').toBeUndefined();
  });
});
