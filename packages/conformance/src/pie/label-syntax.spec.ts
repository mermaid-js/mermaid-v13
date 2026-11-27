import { describe, expect, it } from 'vitest';
import { MARKDOWN_NOT_READ } from '@mermaid-js/core/text/markdown-warning';
import { fixture } from '../edge-label-centre.ts';
import { labelsOf } from '../label-runs.ts';
import { deterministicApi } from '../render-api.ts';

/**
 * Pie labels through core's label handler (#1368, #1407), rendered through the public `render()`
 * from `e2e/diagrams/pie/pr-check/label-syntax.mmd` and its `markdownAlwaysOn` twin: in the
 * default mode markdown only in a markdown string, which the parser marks because it removes a
 * slice's quotes; tags and a written `\n` everywhere. With `markdownAlwaysOn`, every label is
 * markdown. Pie has no text output (`format: 'ascii'` throws), so the SVG is all there is.
 */
const SOURCE = fixture('pie/pr-check/label-syntax.mmd');
const ALWAYS = fixture('pie/pr-check/label-syntax-compat.mmd');

const render = async (source: string, config = {}) => deterministicApi(config).render('x', source);
const codes = async (source: string, config = {}) =>
  (await render(source, config)).warnings.map((w) => w.code);

describe('pie render: label syntax (#1368)', () => {
  it('reads markdown only in a markdown string, in the title and the slice labels', async () => {
    const { svg } = await render(SOURCE);
    expect(labelsOf(svg, 'slice')).toEqual([
      'slice **bold** _ital_',
      'slice [b:bold] [i:ital]',
      'slice single [b:bold]',
      'slice a `code` b',
      'slice [b:bold] [i:ital] / next H[s:2]O',
      'slice one / two',
    ]);
    expect(labelsOf(svg, 'title')).toEqual(['title **bold** _ital_']);
  });

  it('reads a title in quotes and backticks as markdown and draws one in bare backticks as written', async () => {
    const title = async (t: string) =>
      labelsOf((await render(`pie title ${t}\n "a" : 1`)).svg, 't');
    expect(await title('"`t **b**`"')).toEqual(['t [b:b]']);
    expect(await title('`t **b**`')).toEqual(['`t **b**`']);
    expect(await title('t <b>b</b>\\nnext')).toEqual(['t [b:b] / next']);
  });

  it('with markdownAlwaysOn, reads every label as markdown', async () => {
    for (const config of [{}, { markdownAlwaysOn: true }, { pie: { markdownAlwaysOn: true } }]) {
      const { svg } = await render(ALWAYS, config);
      expect(labelsOf(svg, 'slice')).toEqual([
        'slice [b:bold] [i:ital]',
        'slice [b:bold] [i:ital]',
        'slice single [b:bold]',
        'slice a [m:code] b',
        'slice [b:bold] [i:ital] / next H[s:2]O',
        'slice one / two',
      ]);
      expect(labelsOf(svg, 'title')).toEqual(['title [b:bold] [i:ital]']);
    }
    // Set through the pie section instead of the fixture's front matter.
    const section = await render(SOURCE, { pie: { markdownAlwaysOn: true } });
    expect(section.svg).toBe((await render(ALWAYS)).svg);
  });

  it('warns once per render about markdown drawn as written', async () => {
    expect(await codes(SOURCE)).toEqual([MARKDOWN_NOT_READ.code]);
    expect(await codes(ALWAYS)).toEqual([]);
    expect(await codes(SOURCE, { pie: { markdownAlwaysOn: true } })).toEqual([]);
    expect(await codes('pie title "`**t**`"\n  "`**a**`" : 1\n  \'`_b_`\' : 2')).toEqual([]);
  });
});
