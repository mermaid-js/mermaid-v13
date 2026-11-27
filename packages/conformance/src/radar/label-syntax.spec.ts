import { describe, expect, it } from 'vitest';
import { MARKDOWN_NOT_READ } from '@mermaid-js/core/text/markdown-warning';
import { fixture } from '../edge-label-centre.ts';
import { deterministicApi } from '../render-api.ts';

/**
 * Radar labels through core's label handler (#1368, #1394), rendered through the public
 * `render()` from `e2e/diagrams/radar/pr-check/label-syntax.mmd` and its `markdownAlwaysOn`
 * twin: in the default mode markdown only in a markdown string, bare backticks as written, tags
 * and a written `\n` everywhere; with `markdownAlwaysOn`, every label is markdown. Radar has no
 * text output (`format: 'ascii'` throws), so the SVG is all there is to follow.
 */
const SOURCE = fixture('radar/pr-check/label-syntax.mmd');
const ALWAYS = fixture('radar/pr-check/label-syntax-compat.mmd');

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

describe('radar render: label syntax (#1368)', () => {
  it('reads markdown only in a markdown string, in each label kind', async () => {
    const { svg } = await render(SOURCE);
    const kind = (k: string) => [
      `${k} **bold** _ital_`,
      `${k} |[b:bold]| |[i:ital]`,
      ...(k === 'axis' ? ['axis single |[b:bold]'] : []),
      `${k} a \`code\` b`,
      `${k} |[b:bold]| |[i:ital]|next H|2|O`,
      `${k} one|two`,
    ];
    expect(labels(svg, 'radarAxisLabel')).toEqual(kind('axis'));
    expect(labels(svg, 'radarLegendText')).toEqual(kind('curve'));
    expect(labels(svg, 'radarTitle')).toEqual(['title **bold** _ital_']);
  });

  it('draws a title in bare backticks as written', async () => {
    const { svg } = await render('radar-beta\n  title `t **b**`\n  axis A');
    expect(labels(svg, 'radarTitle')).toEqual(['`t **b**`']);
  });

  it('with markdownAlwaysOn, reads every label kind as markdown', async () => {
    const kind = (k: string) => [
      `${k} |[b:bold]| |[i:ital]`,
      `${k} |[b:bold]| |[i:ital]`,
      ...(k === 'axis' ? ['axis single |[b:bold]'] : []),
      `${k} a |[m:code]| b`,
      `${k} |[b:bold]| |[i:ital]|next H|2|O`,
      `${k} one|two`,
    ];
    for (const config of [{}, { markdownAlwaysOn: true }, { radar: { markdownAlwaysOn: true } }]) {
      const { svg } = await render(ALWAYS, config);
      expect(labels(svg, 'radarAxisLabel')).toEqual(kind('axis'));
      expect(labels(svg, 'radarLegendText')).toEqual(kind('curve'));
      expect(labels(svg, 'radarTitle')).toEqual(['title |[b:bold]| |[i:ital]']);
    }
    // Set through the radar section instead of the fixture's front matter.
    const section = await render(SOURCE, { radar: { markdownAlwaysOn: true } });
    expect(section.svg).toBe((await render(ALWAYS)).svg);
  });

  it('warns once per render about markdown drawn as written', async () => {
    const codes = async (source: string, config = {}) =>
      (await render(source, config)).warnings.map((w) => w.code);
    expect(await codes(SOURCE)).toEqual([MARKDOWN_NOT_READ.code]);
    expect(await codes(ALWAYS)).toEqual([]);
    expect(await codes(SOURCE, { radar: { markdownAlwaysOn: true } })).toEqual([]);
    const strings = 'radar-beta\n  title "`**t**`"\n  axis a["`**a**`"]\n  curve c["`**c**`"]{1}';
    expect(await codes(strings)).toEqual([]);
  });
});
