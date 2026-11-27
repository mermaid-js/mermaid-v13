import { describe, expect, it } from 'vitest';
import { fixture } from '../edge-label-centre.ts';
import { deterministicApi } from '../render-api.ts';

/**
 * Cynefin labels through core's label handler (#1368), rendered through the public `render()`
 * from `e2e/diagrams/cynefin/pr-check/label-syntax.mmd`: markdown only in a markdown string,
 * which the parser marks because it removes the quotes; tags and a written `\n` everywhere.
 * No cynefin label kind read markdown in v12, so `legacyMarkdown` changes nothing.
 */
const SOURCE = fixture('cynefin/pr-check/label-syntax.mmd');

/** Each label of `cls`: its text, and whether a run of it is bold, in drawing order. */
function labels(svg: string, cls: string): { text: string; bold: boolean }[] {
  const re = new RegExp(`<text class="${cls}"[^>]*>(.*?)</text>`, 'g');
  return [...svg.matchAll(re)].map(([, inner = '']) => ({
    text: inner.replace(/<tspan[^>]*>/g, '').replace(/<\/tspan>/g, '|'),
    bold: /<tspan[^>]*font-weight/.test(inner),
  }));
}

describe('cynefin render: label syntax (#1368)', () => {
  it('reads markdown only in a markdown string, in each label kind', async () => {
    const { svg } = await deterministicApi().render('x', SOURCE);
    const kind = (k: string) => [
      { text: `${k} **bold** _ital_`, bold: false },
      { text: `${k} |bold| |ital|`, bold: true },
      { text: `${k} a \`code\` b`, bold: false },
      ...(k === 'item' ? [{ text: 'item single |bold|', bold: true }] : []),
      { text: `${k} |bold| |ital|next H|2|O|`, bold: true },
      { text: `${k} one|two|`, bold: false },
    ];
    expect(labels(svg, 'cynefinItemText')).toEqual(kind('item'));
    expect(labels(svg, 'cynefinArrowLabel')).toEqual(kind('transition'));
    expect(labels(svg, 'cynefinTitle')).toEqual([{ text: 'title |bold| |ital|', bold: true }]);
  });

  it('draws a title in bare backticks as written (D733)', async () => {
    const { svg } = await deterministicApi().render('x', 'cynefin-beta\n  title `t **b**`');
    expect(labels(svg, 'cynefinTitle')).toEqual([{ text: '`t **b**`', bold: false }]);
  });

  it('draws the same with legacyMarkdown: no cynefin label kind read markdown in v12', async () => {
    const legacy = deterministicApi({ legacyMarkdown: true });
    expect((await legacy.render('x', SOURCE)).svg).toBe(
      (await deterministicApi().render('x', SOURCE)).svg
    );
  });
});
