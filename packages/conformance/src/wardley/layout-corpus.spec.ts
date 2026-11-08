import { beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import { layoutWardley, parseWardley } from '@mermaid-js/diagram-wardley';
import { wardleyLabelOverlaps, wardleyLayoutViolations } from '@mermaid-js/diagram-wardley/testing';
import type { CorpusItem } from '../types.ts';
import { wardleyGateCorpus } from './corpus.ts';

/**
 * Layout invariants on parser-produced fixtures (R-LAYOUT-3, #490): every source of the wardley
 * gate corpus (e2e fixtures, v12 spec strings, the hand-written and recovery cases, each also
 * with CRLF and comment lines) parsed by the v13 parser, rejected sources included (the model of
 * what parsed), laid out at five `wardley-beta` configs, gives no `wardleyLayoutViolations`: no
 * NaN, every node in the chart, pipeline children on their parent's line and in its box, link
 * ends off the node circles, trends horizontal (but from a moved pipeline parent, GAPS "Spec
 * corrections"), everything inside the bounds. The ten `pr-check` maps, the spec's corpus, also
 * stack no labels (`wardleyLabelOverlaps`) at the default config.
 */
const CONFIGS: readonly Record<string, unknown>[] = [
  {},
  { showGrid: true, nodeRadius: 12, nodeLabelOffset: 0 },
  { width: 400, height: 1200, padding: 10, axisFontSize: 20, labelFontSize: 16 },
  { width: 1, height: 1, padding: 0, nodeRadius: 0, axisFontSize: 0, labelFontSize: 0 },
  { width: -5, height: Number.NaN, padding: 700, nodeRadius: 'big', showGrid: 1 },
];

let theme: Theme;
let corpus: CorpusItem[];
beforeAll(async () => {
  theme = createTheme(await loadTheme('default'));
  corpus = await wardleyGateCorpus();
});

const lay = (source: string, section: Record<string, unknown>) => {
  const { model } = parseWardley(source);
  const layout = layoutWardley(model, {
    config: { 'wardley-beta': section } as unknown as ResolvedConfig,
    measurer: tableMeasurer,
    theme,
    warn: () => undefined,
  });
  return { model, layout };
};

describe('wardley layout invariants on parser-produced fixtures', () => {
  it('hold over the gate corpus at every config', () => {
    const failures: string[] = [];
    let nodes = 0;
    let links = 0;
    for (const item of corpus)
      for (const section of CONFIGS) {
        const { model, layout } = lay(item.source, section);
        if (section === CONFIGS[0]) {
          nodes += layout.nodes.length;
          links += layout.links.length;
        }
        const v = wardleyLayoutViolations(model, layout);
        if (v.length > 0) failures.push(`${item.id} ${JSON.stringify(section)}: ${v.join('; ')}`);
      }
    expect(corpus.filter((i) => i.id.startsWith('e2e/') && !i.id.endsWith(')')).length).toBe(42);
    expect(nodes).toBeGreaterThan(1000);
    expect(links).toBeGreaterThan(400);
    expect(failures.slice(0, 10)).toEqual([]);
  }, 120_000);

  it('stack no labels on the pr-check maps', () => {
    const maps = corpus.filter((i) => i.id.startsWith('e2e/pr-check/'));
    expect(maps.length).toBeGreaterThanOrEqual(10);
    const failures = maps.flatMap((item) =>
      wardleyLabelOverlaps(lay(item.source, {}).layout).map((o) => `${item.id}: ${o}`)
    );
    expect(failures).toEqual([]);
  });
});
