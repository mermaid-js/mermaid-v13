import { beforeAll, describe, expect, it } from 'vitest';
import { CORE_DEFAULTS, resolveConfig, type ConfigInput } from '@mermaid-js/core/config';
import { layered, pxProfile, validateLayout, type LayoutEngine } from '@mermaid-js/core/layout';
import { tree } from '@mermaid-js/core/layout/tree';
import { preprocess } from '@mermaid-js/core/preprocess';
import { tableMeasurer } from '@mermaid-js/core/text';
import { MARKDOWN_NOT_READ } from '@mermaid-js/core/text/markdown-warning';
import { createTheme, isThemeName, loadTheme, type ThemeName } from '@mermaid-js/core/theme';
import {
  layoutMindmap,
  mindmap,
  parseMindmap,
  type MindmapModel,
} from '@mermaid-js/diagram-mindmap';
import { mindmapProblems, treeProblems } from '@mermaid-js/diagram-mindmap/testing';
import elkLayouts from '@mermaid-js/layout-elk';
import { mindmapCases, mindmapCorpus } from './corpus.ts';

// DDLT on parser-produced mindmaps (spec #294 T3, the `ddlt` rule: parse the source, never hand
// build the graph): the e2e corpus, the harvested v12 spec and syntax-page strings and the
// parser and lexer cases, parsed by the v13 parser, measured with the table measurer in each
// source's theme and laid out by `layoutMindmap`, the entry point the plugin calls, through
// `tree` (the default, D284), `layered` and ELK (`@mermaid-js/layout-elk`, D282).

interface Fixture {
  readonly id: string;
  readonly model: MindmapModel;
  readonly config: ReturnType<typeof resolveConfig>;
  readonly theme: ThemeName;
}

const fixtures: Fixture[] = [];
let elk: LayoutEngine;

beforeAll(async () => {
  elk = await elkLayouts.find((l) => l.name === 'elk')!.loader();
  // A label holding `~n:` once made two edge ids the same (#387 review): the e2e fixture
  // `baseline/layout/labels-holding-edge-id-text.mmd`.
  for (const item of [...(await mindmapCorpus()), ...mindmapCases()]) {
    const pre = preprocess(item.source);
    const directives = pre.directives.flatMap((d) =>
      d.kind === 'init' && d.args && typeof d.args === 'object' ? [d.args as ConfigInput] : []
    );
    const config = resolveConfig(CORE_DEFAULTS, {}, pre.frontMatter?.config, directives);
    const colorBy = config.mindmap?.colorBy === 'depth' ? 'depth' : 'branch';
    const parse = parseMindmap(item.source, { preprocessed: pre, colorBy });
    if (parse.diagnostics.some((d) => d.severity === 'error')) continue;
    const theme =
      typeof config.theme === 'string' && isThemeName(config.theme) ? config.theme : 'default';
    fixtures.push({ id: item.id, model: parse.model, config, theme });
  }
}, 60_000);

const ENGINES: readonly [string, () => LayoutEngine][] = [
  ['tree', () => tree],
  ['layered', () => layered],
  ['elk', () => elk],
];

/**
 * The sources with a plain label holding an emphasis pair, which give `MARKDOWN_NOT_READ`
 * (#1368): the label fixture, whose plain rows show it, and two bare-backtick labels over two
 * lines, whose code span the warning does not see across the line break.
 */
const MARKDOWN_SOURCES = [
  'e2e/baseline/text/backtick-label-on-two-lines.mmd',
  'e2e/pr-check/formatted-label-with-linebreak-and-a-wrapping-label-and-emojis.mmd',
  'e2e/pr-check/label-syntax.mmd',
];

async function laidOut(f: Fixture, engine: LayoutEngine) {
  const warnings: string[] = [];
  const layout = layoutMindmap(f.model, {
    config: f.config,
    measurer: tableMeasurer,
    units: pxProfile,
    theme: createTheme(await loadTheme(f.theme), { diagram: mindmap.theme }),
    layout: (graph) => engine(graph, { config: f.config }),
    warn: (w) => warnings.push(w.code),
  });
  return { layout, warnings };
}

describe('mindmap layout over parser-produced fixtures', () => {
  it('covers the corpus: every shape, icons, and the themes it names', () => {
    expect(fixtures.length).toBeGreaterThan(100);
    const nodes = fixtures.flatMap((f) => f.model.nodes);
    const shapes = new Set(nodes.map((n) => n.shape));
    expect([...shapes].sort()).toEqual(
      ['bang', 'circle', 'cloud', 'default', 'hexagon', 'rect', 'rounded'].sort()
    );
    expect(nodes.filter((n) => n.icon).length).toBeGreaterThan(10);
    expect(new Set(fixtures.map((f) => f.theme)).size).toBeGreaterThan(3);
  });

  it.each(ENGINES)(
    '%s: no NaN or overlaps, edges on their boxes, labels and icons inside their shapes',
    async (name, engineOf) => {
      const engine = engineOf();
      const markdown: string[] = [];
      for (const f of fixtures) {
        const { layout, warnings } = await laidOut(f, engine);
        expect(validateLayout(layout.mindmap.graph, layout), f.id).toEqual([]);
        expect(mindmapProblems(layout), f.id).toEqual([]);
        if (name === 'tree') expect(treeProblems(layout.mindmap.graph, layout), f.id).toEqual([]);
        const other = warnings.filter((code) => code !== MARKDOWN_NOT_READ.code);
        expect(other, f.id).toEqual([]);
        if (other.length < warnings.length) markdown.push(f.id);
      }
      // Markdown in a plain label warns (#1368): only these sources hold it.
      expect(markdown).toEqual(MARKDOWN_SOURCES);
    },
    120_000
  );

  it.each(ENGINES)('%s: the same layout twice', async (_, engineOf) => {
    const engine = engineOf();
    const plain = (l: Awaited<ReturnType<typeof laidOut>>['layout']) =>
      JSON.stringify([[...l.nodes], [...l.edges], l.width, l.height]);
    for (const f of fixtures) {
      const [a, b] = [await laidOut(f, engine), await laidOut(f, engine)];
      expect(plain(a.layout), f.id).toBe(plain(b.layout));
    }
  });
});
