import { describe, expect, it } from 'vitest';
import { MARKDOWN_NOT_READ } from '@mermaid-js/core/text/markdown-warning';
import { fixture } from '../edge-label-centre.ts';
import { deterministicApi } from '../render-api.ts';

/**
 * Cynefin labels through core's label handler (#1368, #1394), rendered through the public
 * `render()` from `e2e/diagrams/cynefin/pr-check/label-syntax.mmd` and its `markdownAlwaysOn`
 * twin: in the default mode markdown only in a markdown string, which the parser marks because
 * it removes the quotes; tags and a written `\n` everywhere. With `markdownAlwaysOn`, every
 * label is markdown; the domain names and descriptions are fixed text, not labels. Cynefin has no
 * text output (`format: 'ascii'` throws), so the SVG is all there is to follow.
 */
const SOURCE = fixture('cynefin/pr-check/label-syntax.mmd');
const ALWAYS = fixture('cynefin/pr-check/label-syntax-compat.mmd');

/**
 * Each label of `cls`, in drawing order: its runs joined, each `[b:…]`, `[i:…]` or `[m:…]` when
 * bold, italic or monospace, and `|` between runs.
 */
function labels(svg: string, cls: string): string[] {
  const re = new RegExp(`<text class="${cls}"[^>]*>(.*?)</text>`, 'g');
  return [...svg.matchAll(re)].map(([, inner = '']) => {
    if (!inner.includes('<tspan')) return inner;
    return [...inner.matchAll(/<tspan([^>]*)>(.*?)<\/tspan>/g)]
      .map(([, attrs = '', text = '']) => {
        const marks = [
          attrs.includes('font-weight') ? 'b' : '',
          attrs.includes('font-style="italic"') ? 'i' : '',
          attrs.includes('font-family') ? 'm' : '',
        ].join('');
        return marks ? `[${marks}:${text}]` : text;
      })
      .join('|');
  });
}

const render = async (source: string, config = {}) => deterministicApi(config).render('x', source);

describe('cynefin render: label syntax (#1368)', () => {
  it('reads markdown only in a markdown string, in each label kind', async () => {
    const { svg } = await render(SOURCE);
    const kind = (k: string) => [
      `${k} **bold** _ital_`,
      `${k} |[b:bold]| |[i:ital]`,
      `${k} a \`code\` b`,
      ...(k === 'item' ? ['item single |[b:bold]'] : []),
      `${k} |[b:bold]| |[i:ital]|next H|2|O`,
      `${k} one|two`,
    ];
    expect(labels(svg, 'cynefinItemText')).toEqual(kind('item'));
    expect(labels(svg, 'cynefinArrowLabel')).toEqual(kind('transition'));
    expect(labels(svg, 'cynefinTitle')).toEqual(['title **bold** _ital_']);
  });

  it('reads a quoted title as markdown and draws one in bare backticks as written', async () => {
    const quoted = await render('cynefin-beta\n  title "`t **b**`"');
    expect(labels(quoted.svg, 'cynefinTitle')).toEqual(['t |[b:b]']);
    const bare = await render('cynefin-beta\n  title `t **b**`');
    expect(labels(bare.svg, 'cynefinTitle')).toEqual(['`t **b**`']);
  });

  it('with markdownAlwaysOn, reads every label kind as markdown, and no fixed text', async () => {
    const kind = (k: string) => [
      `${k} |[b:bold]| |[i:ital]`,
      `${k} |[b:bold]| |[i:ital]`,
      `${k} a |[m:code]| b`,
      ...(k === 'item' ? ['item single |[b:bold]'] : []),
      `${k} |[b:bold]| |[i:ital]|next H|2|O`,
      `${k} one|two`,
    ];
    const plain = (await render(SOURCE)).svg;
    for (const config of [
      {},
      { markdownAlwaysOn: true },
      { cynefin: { markdownAlwaysOn: true } },
    ]) {
      const { svg } = await render(ALWAYS, config);
      expect(labels(svg, 'cynefinItemText')).toEqual(kind('item'));
      expect(labels(svg, 'cynefinArrowLabel')).toEqual(kind('transition'));
      expect(labels(svg, 'cynefinTitle')).toEqual(['title |[b:bold]| |[i:ital]']);
      for (const fixed of ['cynefinDomainLabel', 'cynefinSubtitle'])
        expect(labels(svg, fixed)).toEqual(labels(plain, fixed));
    }
    // Set through the cynefin section instead of the fixture's front matter.
    const section = await render(SOURCE, { cynefin: { markdownAlwaysOn: true } });
    expect(section.svg).toBe((await render(ALWAYS)).svg);
  });

  it('warns once per render about markdown drawn as written', async () => {
    const codes = async (source: string, config = {}) =>
      (await render(source, config)).warnings.map((w) => w.code);
    expect(await codes(SOURCE)).toEqual([MARKDOWN_NOT_READ.code]);
    expect(await codes(ALWAYS)).toEqual([]);
    expect(await codes(SOURCE, { cynefin: { markdownAlwaysOn: true } })).toEqual([]);
    const strings =
      'cynefin-beta\n  title "`**t**`"\n  complex\n    "`**i**`"\n  complex --> clear : "`**l**`"';
    expect(await codes(strings)).toEqual([]);
  });
});
