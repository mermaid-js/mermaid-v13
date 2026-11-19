import { describe, expect, it } from 'vitest';
import { parseFlowchart } from '@mermaid-js/diagram-flowchart';
import type { FlowSubgraph } from '@mermaid-js/diagram-flowchart';
import type { AstNode, StatementSpan } from '@mermaid-js/core/parser-kit';
import { loadOracle } from '../oracle.ts';
import { resolveCorpus } from '../corpus.ts';
import { PARITY_SUITES } from '../registry.ts';
import { flowchartV12Snapshot } from './v12.ts';

/**
 * R-PARSE-5: go-to-definition, references and fold ranges from the parse output, checked
 * against mermaid@12's model over the parity corpus:
 * - every v12 vertex has exactly one node definition, and nothing else has one;
 * - every v12 class has a definition, and every named v12 subgraph one per `subgraph` line;
 * - each v12 subgraph has a fold range, and each of its member vertices occurs inside one.
 */
describe('flowchart symbols and fold ranges match the v12 model', () => {
  it('over the parity corpus', async () => {
    const oracle = await loadOracle();
    const problems: string[] = [];
    let checked = 0;
    for await (const item of resolveCorpus({}, PARITY_SUITES)) {
      // #644: v12's detection first, so only its flowcharts pay for an oracle parse. It is the
      // type an accepted parse reports, so the same sources reach the checks below.
      if (!oracle.detect(item.source)?.startsWith('flowchart')) continue;
      const v12 = await oracle.parse(item.source);
      if (!v12.accepted || !v12.diagramType.startsWith('flowchart')) continue;
      const model = flowchartV12Snapshot(v12.db);
      const r = parseFlowchart(item.source);
      if (r.diagnostics.some((d) => d.severity === 'error')) continue;
      checked++;
      const fail = (what: string) => problems.push(`${item.id}: ${what}`);
      const defs = (kind: string) =>
        r.symbols.filter((s) => s.kind === kind && s.role === 'def').map((s) => s.name);

      const nodeDefs = defs('node');
      const vertices = model.vertices.map((v) => v.id);
      if (JSON.stringify([...nodeDefs].sort()) !== JSON.stringify([...vertices].sort())) {
        fail(
          `node definitions ${JSON.stringify(nodeDefs)} vs vertices ${JSON.stringify(vertices)}`
        );
      }
      const classDefs = new Set(defs('class'));
      for (const c of model.classes)
        if (!classDefs.has(c.id)) fail(`class ${c.id} has no definition`);
      const subgraphDefs = new Set(defs('subgraph'));
      for (const s of model.subGraphs) {
        if (!/^subGraph\d+$/.test(s.id) && !subgraphDefs.has(s.id)) {
          fail(`subgraph ${s.id} has no definition`);
        }
      }

      // Fold ranges: the statement spans of kind `subgraph`, paired with AST subgraphs.
      const folds = new Set<string>();
      const walkSpans = (spans: StatementSpan[]) => {
        for (const s of spans) {
          if (s.kind === 'subgraph') folds.add(`${s.range.start}:${s.range.end}`);
          if (s.children) walkSpans(s.children);
        }
      };
      walkSpans(r.statements);
      const bodies = new Map<string, FlowSubgraph[]>();
      const walkAst = (nodes: readonly AstNode[]) => {
        for (const n of nodes) {
          if (n.type === 'Subgraph') {
            const sg = n as FlowSubgraph;
            bodies.set(sg.name, [...(bodies.get(sg.name) ?? []), sg]);
          }
          if (n.children) walkAst(n.children);
        }
      };
      walkAst(r.ast.children);
      const isVertex = new Set(vertices);
      for (const s of model.subGraphs) {
        const mine = bodies.get(s.id) ?? [];
        if (mine.length === 0) {
          fail(`subgraph ${s.id} has no AST node`);
          continue;
        }
        for (const b of mine) {
          if (!folds.has(`${b.range.start}:${b.range.end}`))
            fail(`subgraph ${s.id} has no fold range`);
        }
        for (const member of s.nodes) {
          if (!isVertex.has(member)) continue;
          const inside = r.symbols.some(
            (o) =>
              o.name === member &&
              mine.some((b) => b.range.start <= o.range.start && o.range.end <= b.range.end)
          );
          if (!inside) fail(`member ${member} of ${s.id} does not occur in its fold range`);
        }
      }
    }
    expect(checked).toBeGreaterThan(600);
    expect(problems).toEqual([]);
  }, 120_000);
});
