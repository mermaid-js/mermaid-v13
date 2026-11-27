import { describe, expect, it } from 'vitest';
import { MARKDOWN_NOT_READ } from '@mermaid-js/core/text/markdown-warning';
import { fixture } from '../edge-label-centre.ts';
import { labelsOf } from '../label-runs.ts';
import { deterministicApi } from '../render-api.ts';

/**
 * Venn labels through core's label handler (#1368, #1407), rendered through the public
 * `render()` from `e2e/diagrams/venn/pr-check/label-syntax.mmd` and its `markdownAlwaysOn` twin:
 * in the default mode markdown only in a markdown string, which the parser marks because it
 * removes the quotes (of a `["…"]` label, a quoted id and a quoted title); backticks without
 * quotes as written, tags and a written `\n` everywhere. With `markdownAlwaysOn`, every label is
 * markdown. Venn has no text output (`format: 'ascii'` throws), so the SVG is all there is.
 *
 * Labels wrap at their circle's radius and text nodes at their grid cell, so most break between
 * words (` / `); only the written `\n` and `<br>` rows hold breaks of their own.
 */
const SOURCE = fixture('venn/pr-check/label-syntax.mmd');
const ALWAYS = fixture('venn/pr-check/label-syntax-compat.mmd');

const render = async (source: string, config = {}) => deterministicApi(config).render('x', source);
const codes = async (source: string, config = {}) =>
  (await render(source, config)).warnings.map((w) => w.code);

describe('venn render: label syntax (#1368)', () => {
  it('reads markdown only in a markdown string, in each label kind', async () => {
    const { svg } = await render(SOURCE);
    expect(labelsOf(svg, 'set')).toEqual([
      'set **bold** / _ital_',
      'set [b:bold] [i:ital]',
      '`set / **bold** / _ital_`',
    ]);
    expect(labelsOf(svg, 'union')).toEqual([
      'union a / `code` b',
      'union [b:bold] / [i:ital] / next H[s:2]O',
      'union one / two',
      'union / **bold** / _ital_',
    ]);
    expect(labelsOf(svg, 'text')).toEqual([
      'text / **bold** / _ital_',
      'text / [b:bold] / [i:ital]',
      '`text / **bold** / _ital_`',
      'text a / `code` / b',
      'text / [b:bold] / [i:ital] / next H / [s:2]O',
      'text / one / two',
    ]);
    expect(labelsOf(svg, 'title')).toEqual(['title **bold** _ital_']);
  });

  it('reads a quoted title, id or label in backticks as markdown, and one without quotes as written', async () => {
    const drawn = async (body: string, kind: string) =>
      labelsOf((await render(`venn-beta\n${body}`)).svg, kind);
    expect(await drawn('  title "`t **b**`"\n  set A', 't ')).toEqual(['t [b:b]']);
    expect(await drawn('  title `t **b**`\n  set A', 't ')).toEqual(['`t **b**`']);
    expect(await drawn('  title t <b>b</b>\\nnext\n  set A', 't ')).toEqual(['t [b:b] / next']);
    expect(await drawn('  set "`s **b**`"', 's ')).toEqual(['s [b:b]']);
    expect(await drawn('  set A\n    text "`n **b**`"', 'n ')).toEqual(['n [b:b]']);
    expect(await drawn('  set A\n    text "n **b**"', 'n ')).toEqual(['n **b**']);
  });

  it('with markdownAlwaysOn, reads every label kind as markdown', async () => {
    for (const config of [{}, { markdownAlwaysOn: true }, { venn: { markdownAlwaysOn: true } }]) {
      const { svg } = await render(ALWAYS, config);
      expect(labelsOf(svg, 'set')).toEqual([
        'set [b:bold] [i:ital]',
        'set [b:bold] [i:ital]',
        '[m:set] / [m:**bold**] / [m:_ital_]',
      ]);
      expect(labelsOf(svg, 'union')).toEqual([
        'union a / [m:code] b',
        'union [b:bold] / [i:ital] / next H[s:2]O',
        'union one / two',
        'union [b:bold] / [i:ital]',
      ]);
      expect(labelsOf(svg, 'text')).toEqual([
        'text / [b:bold] / [i:ital]',
        'text / [b:bold] / [i:ital]',
        '[m:text] / [m:**bold**] / [m:_ital_]',
        'text a / [m:code] b',
        'text / [b:bold] / [i:ital] / next H / [s:2]O',
        'text / one / two',
      ]);
      expect(labelsOf(svg, 'title')).toEqual(['title [b:bold] [i:ital]']);
    }
    // Set through the venn section instead of the fixture's front matter.
    const section = await render(SOURCE, { venn: { markdownAlwaysOn: true } });
    expect(section.svg).toBe((await render(ALWAYS)).svg);
  });

  it('warns once per render about markdown drawn as written', async () => {
    expect(await codes(SOURCE)).toEqual([MARKDOWN_NOT_READ.code]);
    expect(await codes(ALWAYS)).toEqual([]);
    expect(await codes(SOURCE, { venn: { markdownAlwaysOn: true } })).toEqual([]);
    const strings =
      'venn-beta\n  title "`**t**`"\n  set A["`**a**`"]\n    text n["`_n_`"]\n  set "`**B**`"\n  union A, "`**B**`"["`**u**`"]';
    expect(await codes(strings)).toEqual([]);
  });
});
