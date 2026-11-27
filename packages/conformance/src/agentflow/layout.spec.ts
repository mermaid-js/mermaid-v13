// DDLT on parser-produced agentflows (spec #523 T3, the `ddlt` rule: parse the source, never
// hand build the graph): the e2e corpus (with `baseline/layout/`, the fixtures written for the
// layout), the harvested v12 spec and syntax-page strings and the cases, parsed by the v13
// parser, measured with the table measurer in each source's theme and laid out by
// `layoutAgentflow`, the entry point the plugin calls, through `layered` (the default), ELK
// (`@mermaid-js/layout-elk`, D171) and `compass` (D327).
import { beforeAll, describe, expect, it } from 'vitest';
import { layered, pxProfile, validateLayout, type LayoutEngine } from '@mermaid-js/core/layout';
import { compass } from '@mermaid-js/core/layout/compass';
import { tableMeasurer } from '@mermaid-js/core/text';
import { MARKDOWN_NOT_READ, markdownOutside } from '@mermaid-js/core/text/markdown-warning';
import type { Theme } from '@mermaid-js/core/theme';
import { layoutAgentflow, type AgentflowModel } from '@mermaid-js/diagram-agentflow';
import {
  agentflowLayoutProblems,
  parseAgentflowForTest,
  type ParsedAgentflow,
} from '@mermaid-js/diagram-agentflow/testing';
import elkLayouts from '@mermaid-js/layout-elk';
import { v12DecodeEntities } from '../v12-entities.ts';
import { loadOracle } from '../oracle.ts';
import { agentflowCases, agentflowCorpus } from './corpus.ts';

interface Fixture {
  readonly id: string;
  readonly source: string;
  readonly model: AgentflowModel;
  readonly config: ParsedAgentflow['config'];
  readonly theme: Theme;
}

const fixtures: Fixture[] = [];
let elk: LayoutEngine;

beforeAll(async () => {
  elk = await elkLayouts.find((l) => l.name === 'elk')!.loader();
  for (const item of [...(await agentflowCorpus()), ...agentflowCases()]) {
    // The plugin's parse path: config, limits, `agentflow.parse` and the source's theme.
    const { preprocessed, parse, config, theme } = await parseAgentflowForTest(item.source);
    const diagnostics = [...preprocessed.diagnostics, ...parse.diagnostics];
    if (diagnostics.some((d) => d.severity === 'error')) continue;
    fixtures.push({ id: item.id, source: item.source, model: parse.model, config, theme });
  }
}, 60_000);

const ENGINES: readonly [string, () => LayoutEngine][] = [
  ['layered', () => layered],
  ['elk', () => elk],
  ['compass', () => compass],
];

/**
 * Whether a label of `f` is plain and holds an emphasis pair, so its render warns
 * `MARKDOWN_NOT_READ` (#1368, #1396); its labels as the layout reads them, with the parser's mark.
 */
function warnsMarkdown(f: Fixture): boolean {
  const { vertices, edges, flows } = f.model;
  const labels = [
    ...vertices.map((v) => [v.text, v.labelType] as const),
    ...edges.map((e) => [e.text, e.labelType] as const),
    ...flows.map((g) => [g.title, g.labelType] as const),
  ];
  return labels.some(([text, type]) =>
    markdownOutside(text, { markdown: type === 'markdown' }, f.config)
  );
}

async function laidOut(f: Fixture, engine: LayoutEngine) {
  const warnings: string[] = [];
  const layout = layoutAgentflow(f.model, {
    config: f.config,
    measurer: tableMeasurer,
    units: pxProfile,
    theme: f.theme,
    layout: (graph) => engine(graph, { config: f.config }),
    warn: (w) => warnings.push(w.code),
  });
  return { layout, warnings };
}

describe('agentflow layout over parser-produced fixtures', () => {
  it('covers the corpus: every shape, collapsed and nested flows, connectors, loops', () => {
    expect(fixtures.length).toBeGreaterThan(300);
    const vertices = fixtures.flatMap((f) => f.model.vertices);
    expect(new Set(vertices.map((v) => v.shape))).toEqual(
      new Set(['rounded', 'fr-rect', 'lean-r', 'diam', 'lin-doc', 'hex'])
    );
    const flows = fixtures.flatMap((f) => f.model.flows);
    expect(flows.filter((f) => f.collapsed).length).toBeGreaterThan(20);
    expect(flows.filter((f) => f.collapsedInto !== undefined).length).toBeGreaterThan(5);
    expect(flows.filter((f) => f.parent !== undefined).length).toBeGreaterThan(20);
    expect(vertices.filter((v) => v.connector).length).toBeGreaterThan(10);
    const edges = fixtures.flatMap((f) => f.model.edges);
    expect(edges.filter((e) => e.start === e.end).length).toBeGreaterThan(0);
    expect(edges.some((e) => e.start === 'connectors')).toBe(true);
  });

  it.each(ENGINES)(
    '%s: no NaN, no overlaps, flows hold their members, ends on outlines, inside the drawing',
    async (_name, engineOf) => {
      const engine = engineOf();
      for (const f of fixtures) {
        const { layout, warnings } = await laidOut(f, engine);
        expect(validateLayout(layout.agentflow.graph, layout), f.id).toEqual([]);
        expect(agentflowLayoutProblems(f.model, layout), f.id).toEqual([]);
        // The one content warning: markdown outside a markdown string, exactly where a label
        // holds some (#1396). Without the API's once-per-render filter it comes once per label.
        const markdown = warnings.filter((w) => w === MARKDOWN_NOT_READ.code);
        expect(markdown.length > 0, f.id).toBe(warnsMarkdown(f));
        expect(
          warnings.filter(
            (w) => w !== 'STYLE_UNSAFE' && w !== 'STYLE_INVALID' && w !== MARKDOWN_NOT_READ.code
          ),
          f.id
        ).toEqual([]);
      }
    },
    300_000
  );

  // The edges drawn, against mermaid@12.2.0's own `getData()` over the same source: each edge's
  // ends after the collapse (redirected, a fold into one card dropped, an authored loop kept).
  it('draws the edges v12 getData() drew, between the same ends', async () => {
    const oracle = await loadOracle();
    const differences: string[] = [];
    let compared = 0;
    for (const f of fixtures) {
      const v12 = await oracle.parse(f.source);
      if (!v12.accepted) continue;
      const data = (
        v12.db as {
          getData(): { nodes: { id: string }[]; edges: { start: string; end: string }[] };
        }
      ).getData();
      const drawn = new Set(data.nodes.map((n) => v12DecodeEntities(n.id)));
      const old = data.edges.map(
        (e) => [v12DecodeEntities(e.start), v12DecodeEntities(e.end)] as const
      );
      const { layout } = await laidOut(f, layered);
      const now = layout.agentflow.edges.map((e) => `${e.source}>${e.target}`);
      // The one difference (GAPS #547): v12 kept an edge whose end it drew no node for (the
      // reserved `connectors` id); v13 leaves it out.
      const kept = old
        .filter(([a, b]) => drawn.has(a) && drawn.has(b))
        .map(([a, b]) => `${a}>${b}`);
      for (const [a, b] of old) {
        if (drawn.has(a) && drawn.has(b)) continue;
        expect([a, b], f.id).toContain('connectors');
        differences.push(f.id);
      }
      expect(now, f.id).toEqual(kept);
      compared++;
    }
    expect(compared).toBeGreaterThan(300);
    expect(differences.length).toBeGreaterThan(0);
  }, 300_000);

  it.each(ENGINES)(
    '%s: the same layout twice',
    async (_name, engineOf) => {
      const engine = engineOf();
      const plain = (l: Awaited<ReturnType<typeof laidOut>>['layout']) =>
        JSON.stringify([[...l.nodes], [...l.edges], [...l.groups], l.width, l.height]);
      for (const f of fixtures) {
        const [a, b] = [await laidOut(f, engine), await laidOut(f, engine)];
        expect(plain(a.layout), f.id).toBe(plain(b.layout));
      }
    },
    300_000
  );
});
