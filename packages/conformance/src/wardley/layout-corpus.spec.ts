import { beforeAll, describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import { layoutWardley, parseWardley, type WardleyLayout } from '@mermaid-js/diagram-wardley';
import type { WardleyModel } from '@mermaid-js/diagram-wardley';
import { wardleyLabelOverlaps, wardleyLayoutViolations } from '@mermaid-js/diagram-wardley/testing';
import type { CorpusItem } from '../types.ts';
import { wardleyGateCorpus } from './corpus.ts';

/**
 * Layout invariants on parser-produced fixtures (R-LAYOUT-3, #490): every source of the wardley
 * gate corpus (e2e fixtures, v12 spec strings, the hand-written and recovery cases, each also
 * with CRLF and comment lines) parsed by the v13 parser, rejected sources included (the model of
 * what parsed), laid out at five `wardley-beta` configs, gives no `wardleyLayoutViolations`: no
 * NaN and never nothing (D424), every node in the chart, pipeline children on their parent's
 * line and in their box, link ends off the node circles, trends horizontal (but from a moved
 * pipeline parent, GAPS "Spec corrections"), every text one literal line, everything inside
 * the bounds. The ten `pr-check` maps, the spec's corpus, also stack no labels. Then the
 * checker itself, on the tea shop and pipeline maps: broken layouts it must catch.
 */
const CONFIGS: readonly Record<string, unknown>[] = [
  {},
  { showGrid: true, nodeRadius: 12, nodeLabelOffset: 0 },
  { width: 400, height: 1200, padding: 10, axisFontSize: 20, labelFontSize: 16 },
  { width: 1, height: 1, padding: 0, nodeRadius: 0.001, axisFontSize: 0, labelFontSize: 0 },
  { width: -5, height: Number.NaN, padding: 700, nodeRadius: 0, showGrid: 1 },
];

let theme: Theme;
let corpus: CorpusItem[];
beforeAll(async () => {
  theme = createTheme(await loadTheme('default'));
  corpus = await wardleyGateCorpus();
});

function lay(source: string, section: Record<string, unknown> = {}, warnings: Warning[] = []) {
  const { model } = parseWardley(source);
  return { model, layout: layOut(model, section, warnings) };
}

function layOut(
  model: WardleyModel,
  section: Record<string, unknown> = {},
  warnings: Warning[] = []
): WardleyLayout {
  return layoutWardley(model, {
    config: { 'wardley-beta': section } as unknown as ResolvedConfig,
    measurer: tableMeasurer,
    theme,
    warn: (w) => warnings.push(w),
  });
}

const item = (id: string): CorpusItem => {
  const found = corpus.find((i) => i.id === id);
  if (!found) throw new Error(`no corpus item ${id}`);
  return found;
};

describe('wardley layout invariants on parser-produced fixtures', () => {
  it('hold over the gate corpus at every config', () => {
    const failures: string[] = [];
    let nodes = 0;
    let links = 0;
    for (const { id, source } of corpus)
      for (const section of CONFIGS) {
        const { model, layout } = lay(source, section);
        if (section === CONFIGS[0]) {
          nodes += layout.nodes.length;
          links += layout.links.length;
        }
        const v = wardleyLayoutViolations(model, layout);
        if (v.length > 0) failures.push(`${id} ${JSON.stringify(section)}: ${v.join('; ')}`);
      }
    expect(corpus.filter((i) => i.id.startsWith('e2e/') && !i.id.endsWith(')')).length).toBe(67);
    expect(nodes).toBeGreaterThan(1000);
    expect(links).toBeGreaterThan(400);
    expect(failures.slice(0, 10)).toEqual([]);
  }, 120_000);

  it('stack no labels on the pr-check maps', () => {
    const maps = corpus.filter((i) => i.id.startsWith('e2e/pr-check/'));
    expect(maps.length).toBeGreaterThanOrEqual(10);
    const failures = maps.flatMap(({ id, source }) =>
      wardleyLabelOverlaps(lay(source).layout).map((o) => `${id}: ${o}`)
    );
    expect(failures).toEqual([]);
  });

  it('measures labels as v12 drew them, one literal line', () => {
    // v12's DB (12.2.0, probed): "a\nb", "a<br>b", "x &lt; y" as written; `.text()` draws them
    // as one line, the newline as a space. Its `#name;` codes show as their characters, a
    // literal `&amp;` as written (GAPS #493).
    const { layout } = lay(item('wardley-cases/layout-label-literal').source);
    expect(layout.nodes.map((n) => n.label.text)).toEqual([
      'a b',
      'a<br>b',
      'x &lt; y',
      'Tea & "Cups"',
    ]);
    expect(layout.notes[0]!.label.text).toBe('♥ love<br/>x');
    expect(layout.links[0]!.label!.text).toBe('x &amp; *y* <br> z');
  });

  it('draws decreasing stage boundaries backwards, as v12', () => {
    const { model, layout } = lay(item('wardley-cases/layout-stages-decreasing').source);
    const [, back] = layout.stages;
    expect(back!.end).toBeLessThan(back!.start);
    expect(wardleyLayoutViolations(model, layout)).toEqual([]);
  });

  it('drops links between coincident nodes with one WARDLEY_LINK_DROPPED (D425)', () => {
    const warnings: Warning[] = [];
    const { model, layout } = lay(
      item('wardley-cases/layout-link-coincident').source,
      {},
      warnings
    );
    expect(layout.links).toEqual([]);
    const dropped = model.warnings.filter((w) => w.code === 'WARDLEY_LINK_DROPPED');
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.related).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it('puts the box on a merged last child’s line, off the parent’s (named skip)', () => {
    // `P_x_y` is P's child and, later, P_x's: the later pipeline sets its visibility (v12's
    // addNode), so P's box follows it off P's line.
    const { model, layout } = lay(item('wardley-cases/layout-pipeline-merged-child').source);
    const box = layout.pipelines.find((p) => p.nodeId === 'P')!.box;
    const child = layout.nodes.find((n) => n.id === 'P_x_y')!;
    const centre = box.y + box.height / 2;
    expect(centre).toBeCloseTo(child.point.y);
    expect(centre).not.toBeCloseTo(layout.height - layout.padding - 0.5 * layout.chart.height);
    expect(wardleyLayoutViolations(model, layout)).toEqual([]);
  });
});

describe('wardley layout checker', () => {
  const tea = () => parseWardley(item('e2e/pr-check/1-should-render-tea-shop.mmd').source).model;
  const kettle = () =>
    parseWardley(item('e2e/pr-check/3-should-render-pipelines.mmd').source).model;

  it('catches a node off its position, and NaN', () => {
    const model = tea();
    const layout = layOut(model);
    const [first, ...rest] = layout.nodes;
    const nodes = [{ ...first!, point: { x: first!.point.x + 5, y: Number.NaN } }, ...rest];
    const v = wardleyLayoutViolations(model, { ...layout, nodes });
    expect(v.some((m) => m.includes('is NaN'))).toBe(true);
    expect(v.some((m) => m.includes('off its position'))).toBe(true);
  });

  it('catches a link end inside its node, and a link that should be drawn', () => {
    const model = kettle();
    const layout = layOut(model);
    const [link, ...rest] = layout.links;
    const moved = { ...layout, links: [{ ...link!, from: link!.to }, ...rest] };
    expect(wardleyLayoutViolations(model, moved).join()).toMatch(/not on its nodes' edges/);
    expect(wardleyLayoutViolations(model, { ...layout, links: rest })[0]).toMatch(/^drawn links/);
  });

  it('catches a slanted trend, a child off its line or its box, and contents outside the bounds', () => {
    const model = tea();
    const layout = layOut(model);
    const [trend, ...rest] = layout.trends;
    const slanted = {
      ...layout,
      trends: [{ ...trend!, to: { ...trend!.to, y: trend!.to.y + 3 } }, ...rest],
    };
    expect(wardleyLayoutViolations(model, slanted).join()).toMatch(/not horizontal/);
    const shrunk = { ...layout, bounds: { ...layout.bounds, width: layout.bounds.width - 50 } };
    expect(wardleyLayoutViolations(model, shrunk).join()).toMatch(/outside the bounds/);

    const pipelines = kettle();
    const drawn = layOut(pipelines);
    const nudge = (dx: number, dy: number) =>
      drawn.nodes.map((n) =>
        n.id === 'Kettle_Smart Kettle'
          ? { ...n, point: { x: n.point.x + dx, y: n.point.y + dy } }
          : n
      );
    expect(wardleyLayoutViolations(pipelines, { ...drawn, nodes: nudge(0, 4) }).join()).toMatch(
      /off its parent's line/
    );
    expect(wardleyLayoutViolations(pipelines, { ...drawn, nodes: nudge(100, 0) }).join()).toMatch(
      /outside its box's span/
    );
  });

  it('catches a text of several lines, and labels on top of one another', () => {
    const model = tea();
    const layout = layOut(model);
    const [first, ...rest] = layout.nodes;
    const nodes = [{ ...first!, label: { ...first!.label, text: 'a\nb' } }, ...rest];
    expect(wardleyLayoutViolations(model, { ...layout, nodes }).join()).toMatch(
      /one collapsed line/
    );
    const stacked = parseWardley('wardley-beta\ncomponent A [0.5, 0.5]\ncomponent B [0.51, 0.5]\n');
    expect(wardleyLabelOverlaps(layOut(stacked.model))).toEqual(['node A and node B overlap']);
  });
});
