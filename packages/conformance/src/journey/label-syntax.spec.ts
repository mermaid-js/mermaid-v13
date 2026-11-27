import { describe, expect, it } from 'vitest';
import { MARKDOWN_NOT_READ } from '@mermaid-js/core/text/markdown-warning';
import { fixture } from '../edge-label-centre.ts';
import { labelsOf } from '../label-runs.ts';
import { deterministicApi } from '../render-api.ts';

/**
 * Journey labels through core's label handler (#1368, #1407), rendered through the public
 * `render()` from `e2e/diagrams/journey/pr-check/label-syntax.mmd` and its `markdownAlwaysOn`
 * twin: in the default mode markdown only in a markdown string (`"`…`"`), bare backticks as
 * written, tags and a written `\n` everywhere; with `markdownAlwaysOn`, every label is markdown.
 * The title, sections, tasks and the actors in the legend are labels. Journey has no text output
 * (`format: 'ascii'` throws), so the SVG is all there is.
 */
const SOURCE = fixture('journey/pr-check/label-syntax.mmd');
const ALWAYS = fixture('journey/pr-check/label-syntax-compat.mmd');

const render = async (source: string, config = {}) => deterministicApi(config).render('x', source);
const codes = async (source: string, config = {}) =>
  (await render(source, config)).warnings.map((w) => w.code);

/** The six ways of writing, in the fixture's order, as the default mode draws them. */
const plain = (k: string) => [
  `${k} **bold** _ital_`,
  `${k} [b:bold] [i:ital]`,
  `\`${k} **bold** _ital_\``,
  `${k} a \`code\` b`,
  `${k} [b:bold] [i:ital] / next H[s:2]O`,
  `${k} one / two`,
];
/**
 * The same with `markdownAlwaysOn`: bare backticks are one code span, which in a section or task
 * box is wider than the box and wraps after `**bold**`.
 */
const always = (k: string) => [
  `${k} [b:bold] [i:ital]`,
  `${k} [b:bold] [i:ital]`,
  k === 'actor' ? `[m:${k} **bold** _ital_]` : `[m:${k} **bold**] / [m:_ital_]`,
  `${k} a [m:code] b`,
  `${k} [b:bold] [i:ital] / next H[s:2]O`,
  `${k} one / two`,
];
/** The legend lists the actors sorted: markdown string, bare, plain, tags, code span, `\n`. */
const legend = (l: string[]) => [l[1], l[2], l[0], l[4], l[3], l[5]];

describe('journey render: label syntax (#1368)', () => {
  it('reads markdown only in a markdown string, in each label kind', async () => {
    const { svg } = await render(SOURCE);
    expect(labelsOf(svg, 'section')).toEqual(plain('section'));
    expect(labelsOf(svg, 'task')).toEqual(plain('task'));
    expect(labelsOf(svg, 'actor')).toEqual(legend(plain('actor')));
    expect(labelsOf(svg, 'title')).toEqual(['title **bold** _ital_']);
  });

  it('reads a title in quotes and backticks as markdown and draws one in bare backticks as written', async () => {
    const title = async (t: string) =>
      labelsOf((await render(`journey\n  title ${t}\n  section s\n    a: 1: Me`)).svg, 't ');
    expect(await title('"`t **b**`"')).toEqual(['t [b:b]']);
    expect(await title('`t **b**`')).toEqual(['`t **b**`']);
    expect(await title('t <b>b</b>\\nnext')).toEqual(['t [b:b] / next']);
  });

  it('with markdownAlwaysOn, reads every label kind as markdown', async () => {
    for (const config of [
      {},
      { markdownAlwaysOn: true },
      { journey: { markdownAlwaysOn: true } },
    ]) {
      const { svg } = await render(ALWAYS, config);
      expect(labelsOf(svg, 'section')).toEqual(always('section'));
      expect(labelsOf(svg, 'task')).toEqual(always('task'));
      expect(labelsOf(svg, 'actor')).toEqual(legend(always('actor')));
      expect(labelsOf(svg, 'title')).toEqual(['title [b:bold] [i:ital]']);
    }
    // Set through the journey section instead of the fixture's front matter.
    const section = await render(SOURCE, { journey: { markdownAlwaysOn: true } });
    expect(section.svg).toBe((await render(ALWAYS)).svg);
  });

  it('warns once per render about markdown drawn as written', async () => {
    expect(await codes(SOURCE)).toEqual([MARKDOWN_NOT_READ.code]);
    expect(await codes(ALWAYS)).toEqual([]);
    expect(await codes(SOURCE, { journey: { markdownAlwaysOn: true } })).toEqual([]);
    const strings = 'journey\n  title "`**t**`"\n  section "`**s**`"\n    "`**a**`": 1: "`_me_`"';
    expect(await codes(strings)).toEqual([]);
  });
});
