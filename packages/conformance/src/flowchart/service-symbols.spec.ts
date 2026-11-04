import { describe, expect, it } from 'vitest';
import { parseFlowchart } from '@mermaid-js/diagram-flowchart';
import type { FlowSubgraph } from '@mermaid-js/diagram-flowchart';
import type { AstNode, Range, SymbolOccurrence } from '@mermaid-js/core/parser-kit';
import { createLanguageService } from '@mermaid-js/language-service';
import type { DocumentSnapshot } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
import { resolveCorpus } from '../corpus.ts';
import { PARITY_SUITES } from '../registry.ts';
import { flowchartV12Snapshot } from './v12.ts';

/**
 * R-PARSE-5's oracle expectations (symbols.spec.ts) re-run through the language service
 * (D99 suite 2, R-LANG-1): definition, references and folding ranges asked at the places the
 * parse output records, checked against the mermaid v12 model over the parity corpus:
 * - every v12 vertex and class resolves to exactly one definition, holding its name, and
 *   references from any of its occurrences give the same list, with that definition in it;
 *   a name resolving to a `def` occurrence in the node namespace is a v12 vertex or subgraph
 *   (a name only mentioned, as in `click B` for no vertex B, resolves to its first mention);
 * - every named v12 subgraph's definition is on one of its own `subgraph` lines, except one
 *   written quoted (`subgraph "One"`): the parser records the name with the range of the
 *   quoted token, which the service leaves out (#31, GAPS.md), so it has no definition.
 * - each multi-line v12 subgraph body is a `subgraph` fold range, and each member vertex has
 *   a reference inside one of its bodies.
 */

/** Quoted subgraph ids in the corpus, which the service gives no definition (GAPS.md). */
const QUOTED_SUBGRAPH_IDS = 13;

const text = (doc: DocumentSnapshot, r: Range) => doc.text.slice(r.start, r.end);
const inside = (r: Range, outer: Range) => outer.start <= r.start && r.end <= outer.end;

function subgraphBodies(nodes: readonly AstNode[], into = new Map<string, Range[]>()) {
  for (const n of nodes) {
    if (n.type === 'Subgraph') {
      const sg = n as FlowSubgraph;
      into.set(sg.name, [...(into.get(sg.name) ?? []), sg.range]);
    }
    if (n.children) subgraphBodies(n.children, into);
  }
  return into;
}

describe('flowchart definition, references and folding through the service match v12', () => {
  it('over the parity corpus', async () => {
    const oracle = await loadOracle();
    const service = createLanguageService();
    await service.preload({ types: ['flowchart'] });
    const problems: string[] = [];
    let checked = 0;
    let quotedIds = 0;
    for await (const item of resolveCorpus({}, PARITY_SUITES)) {
      const v12 = await oracle.parse(item.source);
      if (!v12.accepted || !v12.diagramType.startsWith('flowchart')) continue;
      const doc = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'flowchart') continue;
      if (doc.diagnostics().some((d) => d.severity === 'error')) continue;
      checked++;
      const fail = (what: string): undefined => {
        problems.push(`${item.id}: ${what}`);
      };
      const model = flowchartV12Snapshot(v12.db);
      // Where to ask: the parse output's own occurrences (R-PARSE-5 checks those directly).
      const parsed = parseFlowchart(item.source);
      const occurrences = (name: string, kinds: readonly string[]): SymbolOccurrence[] =>
        parsed.symbols.filter((s) => s.name === name && kinds.includes(s.kind));

      /** The single definition and the references of `name`, asked at each occurrence. */
      const resolve = (name: string, kinds: readonly string[]): Range | undefined => {
        const at = occurrences(name, kinds);
        if (at.length === 0) return (fail(`${kinds[0]} ${name} has no occurrence`), undefined);
        const defs = new Set<string>();
        const refLists = new Set<string>();
        let def: Range | undefined;
        for (const o of at) {
          const d = doc.definition(o.range.start);
          if (!d || text(doc, d) !== name) return fail(`${name}: definition ${d && text(doc, d)}`);
          defs.add(`${d.start}:${d.end}`);
          def = d;
          const refs = doc.references(o.range.start);
          if (refs.some((r) => text(doc, r) !== name)) fail(`${name}: a reference is not ${name}`);
          refLists.add(JSON.stringify(refs));
        }
        if (defs.size !== 1) fail(`${name}: ${defs.size} definitions`);
        if (refLists.size !== 1) fail(`${name}: references differ by occurrence`);
        const refs = doc.references(at[0]!.range.start);
        if (!refs.some((r) => r.start === def!.start)) fail(`${name}: definition not referenced`);
        return def;
      };

      const NODE = ['node', 'subgraph'];
      const vertices = new Set(model.vertices.map((v) => v.id));
      const subgraphIds = new Set(model.subGraphs.map((s) => s.id));
      for (const v of vertices) resolve(v, NODE);
      for (const c of model.classes) resolve(c.id, ['class']);
      const defStarts = new Set(
        parsed.symbols.filter((x) => x.role === 'def').map((x) => x.range.start)
      );
      for (const s of parsed.symbols.filter((x) => NODE.includes(x.kind))) {
        if (vertices.has(s.name) || subgraphIds.has(s.name)) continue;
        const d = doc.definition(s.range.start);
        if (d && defStarts.has(d.start)) fail(`${s.name} is defined but is no v12 vertex`);
      }

      const bodies = subgraphBodies(parsed.ast.children);
      const folds = doc.foldingRanges().filter((f) => f.kind === 'subgraph');
      for (const s of model.subGraphs) {
        const mine = bodies.get(s.id) ?? [];
        if (mine.length === 0) {
          fail(`subgraph ${s.id} has no AST node`);
          continue;
        }
        const written = occurrences(s.id, ['subgraph']).map((o) => text(doc, o.range));
        if (written.length > 0 && !written.includes(s.id)) {
          if (!written.every((w) => /^["`]/.test(w)))
            fail(`subgraph ${s.id} written ${written.join(' ')}`);
          else quotedIds++;
        } else if (!/^subGraph\d+$/.test(s.id)) {
          const def = resolve(s.id, ['subgraph', 'node']);
          if (
            def &&
            !mine.some((b) => inside(def, b) && !/[\r\n]/.test(doc.text.slice(b.start, def.start)))
          )
            fail(`subgraph ${s.id}: definition is not on its subgraph line`);
        }
        const regions = mine.map((b) => {
          if (!/[\r\n]/.test(doc.text.slice(b.start, b.end).trimEnd())) return b;
          const f = folds.find(
            (x) => x.range.start === b.start && doc.text.slice(x.range.end, b.end).trim() === ''
          );
          if (!f) fail(`subgraph ${s.id} has no fold range`);
          return f?.range ?? b;
        });
        for (const member of s.nodes) {
          if (!vertices.has(member)) continue;
          const at = occurrences(member, NODE)[0];
          const refs = at ? doc.references(at.range.start) : [];
          if (!refs.some((r) => regions.some((g) => inside(r, g))))
            fail(`member ${member} of ${s.id} has no reference in its fold range`);
        }
      }
    }
    expect(checked).toBeGreaterThan(600);
    // The quoted subgraph ids left out above; a change here means the gap moved.
    expect(quotedIds).toBe(QUOTED_SUBGRAPH_IDS);
    expect(problems).toEqual([]);
  }, 180_000);
});
