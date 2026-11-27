// How flowchart reads its labels (spec #1368 T7, D733, D734): node texts, edge texts and
// subgraph titles all go through core's label handler, with no v12 markdown profile. Markdown is
// read only in a quoted markdown string; a written `\n` breaks the line in every label.
import { describe, expect, it } from 'vitest';
import type { DiagramPlugin } from '@mermaid-js/core';
import { CORE_DEFAULTS, resolveConfig } from '@mermaid-js/core/config';
import { preprocess } from '@mermaid-js/core/preprocess';
import { Style, tableMeasurer, type MeasuredLabel } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import { flowchartConfigDefaults } from '../generated/config-defaults.ts';
import { parseFlowchart } from '../parser/index.ts';
import { flowchart } from '../plugin.ts';
import type { FlowRenderContext } from './context.ts';
import type { Prepared } from './prepare.ts';

const { theme: diagramTheme }: Pick<DiagramPlugin, 'theme'> = flowchart;
let theme: Theme | undefined;

/** The measured labels of `src`, laid out with `config` as the render's own. */
async function prepared(src: string, config: Record<string, unknown> = {}): Promise<Prepared> {
  const pre = preprocess(src);
  const resolved = resolveConfig(CORE_DEFAULTS, config, undefined, [], {
    flowchart: flowchartConfigDefaults,
  } as never);
  theme ??= createTheme(await loadTheme('default'), { diagram: diagramTheme });
  const ctx: FlowRenderContext = {
    config: resolved,
    measurer: tableMeasurer,
    theme,
    warn: () => undefined,
  };
  const layout = flowchart.layout(parseFlowchart(src, { preprocessed: pre }).model, ctx);
  return layout.flow!;
}

/** A label's lines as text, a bold run as `[b:…]` and an italic one as `[i:…]`. */
const shown = (label: MeasuredLabel): string[] =>
  label.lines.map((line) =>
    line
      .map((r) => {
        if (r.style & Style.Bold) return `[b:${r.text}]`;
        return r.style & Style.Italic ? `[i:${r.text}]` : r.text;
      })
      .join('')
  );

const node = (p: Prepared, id: string): string[] => shown(p.views.get(id)!.label);
const edge = (p: Prepared, n = 0): string[] => shown(p.edges[n]!.label);

/** Node, edge and subgraph labels, each written one way. */
const CASES: readonly (readonly [string, string, (p: Prepared) => string[], string[]])[] = [
  ['plain node', 'flowchart LR\n  A[node **b** _i_]', (p) => node(p, 'A'), ['node **b** _i_']],
  [
    'quoted md string node',
    'flowchart LR\n  A["`node **b** _i_`"]',
    (p) => node(p, 'A'),
    ['node [b:b] [i:i]'],
  ],
  ['bare backticks node', 'flowchart LR\n  A[`**b**`]', (p) => node(p, 'A'), ['`**b**`']],
  ['code span node', 'flowchart LR\n  A[a `code` b]', (p) => node(p, 'A'), ['a `code` b']],
  [
    'tags node',
    'flowchart LR\n  A[<b>b</b> <i>i</i><br>H<sub>2</sub>O]',
    (p) => node(p, 'A'),
    ['[b:b] [i:i]', 'H2O'],
  ],
  ['written \\n node', 'flowchart LR\n  A[one\\ntwo]', (p) => node(p, 'A'), ['one', 'two']],
  [
    'written \\n in a md string node',
    'flowchart LR\n  A["`**one**\\ntwo`"]',
    (p) => node(p, 'A'),
    ['[b:one]', 'two'],
  ],
  ['trailing <br> node', 'flowchart LR\n  A[one<br>]', (p) => node(p, 'A'), ['one']],
  ['plain edge', 'flowchart LR\n  A -->|e **b**| B', (p) => edge(p), ['e **b**']],
  ['bare backticks edge', 'flowchart LR\n  A -->|`**e**`| B', (p) => edge(p), ['`**e**`']],
  ['md string edge', 'flowchart LR\n  A -->|"`**e**`"| B', (p) => edge(p), ['[b:e]']],
  ['inline md string edge', 'flowchart LR\n  A -- "`**e**`" --> B', (p) => edge(p), ['[b:e]']],
  [
    'written \\n in a md string edge',
    'flowchart LR\n  A -->|"`one\\ntwo`"| B',
    (p) => edge(p),
    ['one', 'two'],
  ],
  [
    'bare backticks subgraph',
    'flowchart LR\n  subgraph s [`**t**`]\n    A\n  end',
    (p) => node(p, 's'),
    ['`**t**`'],
  ],
  [
    'md string subgraph',
    'flowchart LR\n  subgraph s ["`**t**`"]\n    A\n  end',
    (p) => node(p, 's'),
    ['[b:t]'],
  ],
  [
    'written \\n subgraph',
    'flowchart LR\n  subgraph s [one\\ntwo]\n    A\n  end',
    (p) => node(p, 's'),
    ['one', 'two'],
  ],
];

describe('flowchart labels through the core label handler (#1395, D733, D734)', () => {
  it.each(CASES)('%s', async (_, src, read, lines) => {
    expect(read(await prepared(src))).toEqual(lines);
  });

  // No flowchart label kind has a v12 markdown profile: v12 read markdown only in a markdown
  // string, so `legacyMarkdown` changes nothing.
  it.each(CASES)('%s, with legacyMarkdown', async (_, src, read, lines) => {
    expect(read(await prepared(src, { legacyMarkdown: true }))).toEqual(lines);
  });

  it('keeps markdownAutoWrap: false for a markdown string only', async () => {
    const long = 'a rather long label that the wrapping width would break somewhere';
    const src = `flowchart LR\n  A["\`${long}\`"]\n  B[${long}]`;
    const off = await prepared(src, { markdownAutoWrap: false });
    expect(node(off, 'A')).toEqual([long]);
    expect(node(off, 'B').length).toBeGreaterThan(1);
    expect(node(await prepared(src), 'A').length).toBeGreaterThan(1);
  });
});
