import { describe, expect, it } from 'vitest';
import { MARKDOWN_NOT_READ } from '@mermaid-js/core/text/markdown-warning';
import { fixture } from '../edge-label-centre.ts';
import { labelsOf } from '../label-runs.ts';
import { deterministicApi } from '../render-api.ts';

/**
 * Timeline labels through core's label handler (#1368, #1407), rendered through the public
 * `render()` from `e2e/diagrams/timeline/pr-check/label-syntax.mmd` and its `markdownAlwaysOn`
 * twin: in the default mode markdown only in a markdown string (`"`…`"`), bare backticks as
 * written, tags and a written `\n` everywhere; with `markdownAlwaysOn`, every label is markdown.
 * Timeline has no text output (`format: 'ascii'` throws), so the SVG is all there is.
 */
const SOURCE = fixture('timeline/pr-check/label-syntax.mmd');
const ALWAYS = fixture('timeline/pr-check/label-syntax-compat.mmd');

const render = async (source: string, config = {}) => deterministicApi(config).render('x', source);
const codes = async (source: string, config = {}) =>
  (await render(source, config)).warnings.map((w) => w.code);

/**
 * The six ways of writing, in the fixture's order, as the default mode draws them. A section in
 * bare backticks is wider than its box, so it wraps after `**bold**`.
 */
const plain = (k: string) => [
  `${k} **bold** _ital_`,
  `${k} [b:bold] [i:ital]`,
  k === 'section' ? `\`${k} **bold** / _ital_\`` : `\`${k} **bold** _ital_\``,
  `${k} a \`code\` b`,
  `${k} [b:bold] [i:ital] / next H[s:2]O`,
  `${k} one / two`,
];
/** The same with `markdownAlwaysOn`: bare backticks are one code span. */
const always = (k: string) => [
  `${k} [b:bold] [i:ital]`,
  `${k} [b:bold] [i:ital]`,
  `[m:${k} **bold**] / [m:_ital_]`,
  `${k} a [m:code] b`,
  `${k} [b:bold] [i:ital] / next H[s:2]O`,
  `${k} one / two`,
];

describe('timeline render: label syntax (#1368)', () => {
  it('reads markdown only in a markdown string, in each label kind', async () => {
    const { svg } = await render(SOURCE);
    expect(labelsOf(svg, 'section')).toEqual(plain('section'));
    expect(labelsOf(svg, 'period')).toEqual(plain('period'));
    expect(labelsOf(svg, 'event')).toEqual(plain('event'));
    expect(labelsOf(svg, 'title')).toEqual(['title **bold** _ital_']);
  });

  it('reads a title in quotes and backticks as markdown and draws one in bare backticks as written', async () => {
    const title = async (t: string) =>
      labelsOf((await render(`timeline\n  title ${t}\n  2020 : a`)).svg, 't ');
    expect(await title('"`t **b**`"')).toEqual(['t [b:b]']);
    expect(await title('`t **b**`')).toEqual(['`t **b**`']);
    expect(await title('t <b>b</b>\\nnext')).toEqual(['t [b:b] / next']);
  });

  it('with markdownAlwaysOn, reads every label kind as markdown', async () => {
    for (const config of [
      {},
      { markdownAlwaysOn: true },
      { timeline: { markdownAlwaysOn: true } },
    ]) {
      const { svg } = await render(ALWAYS, config);
      expect(labelsOf(svg, 'section')).toEqual(always('section'));
      expect(labelsOf(svg, 'period')).toEqual(always('period'));
      expect(labelsOf(svg, 'event')).toEqual(always('event'));
      expect(labelsOf(svg, 'title')).toEqual(['title [b:bold] [i:ital]']);
    }
    // Set through the timeline section instead of the fixture's front matter.
    const section = await render(SOURCE, { timeline: { markdownAlwaysOn: true } });
    expect(section.svg).toBe((await render(ALWAYS)).svg);
  });

  it('warns once per render about markdown drawn as written', async () => {
    expect(await codes(SOURCE)).toEqual([MARKDOWN_NOT_READ.code]);
    expect(await codes(ALWAYS)).toEqual([]);
    expect(await codes(SOURCE, { timeline: { markdownAlwaysOn: true } })).toEqual([]);
    const strings = 'timeline\n  title "`**t**`"\n  section "`**s**`"\n    "`**p**`" : "`_e_`"';
    expect(await codes(strings)).toEqual([]);
  });
});
