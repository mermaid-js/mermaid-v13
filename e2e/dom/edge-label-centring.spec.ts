/**
 * The edge-label tag centres its text's ink (#1319, D716): rendered in the browser, each tag's
 * ink box has its centre within 0.5 px of the tag rect's centre, both axes. The ink box comes
 * from canvas `measureText` (`actualBoundingBox*`) with the text's computed font, placed at
 * each line's `x` and `y`; `getBBox()` on `<text>` gives the line box, not the ink.
 */
import { expect, test, type Page } from '@playwright/test';

/** The #1319 repro under `theme`: three relation labels, each with a capital or an ascender
 * and a descender. */
const repro = (theme: string) => `---
config:
  theme: ${theme}
  look: neo
---
classDiagram
classA <|-- classB : implements
classC *-- classD : composition
classE o-- classF : aggregation
`;

interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** Each tag's rect and the ink box of its text, in the svg's user units. */
async function measure(page: Page, source: string): Promise<{ rect: Box; ink: Box }[]> {
  await page.goto('/index.html');
  await page.waitForFunction(() => 'mermaid' in window);
  return page.evaluate(async (src) => {
    const { svg } = await window.mermaid.render('d', src);
    const host = document.createElement('div');
    host.innerHTML = svg;
    document.body.appendChild(host);
    await document.fonts.ready;
    const ctx = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
    return [...host.querySelectorAll('g.edgeLabel')].map((g) => {
      const text = g.querySelector('text') as SVGTextElement;
      const cs = getComputedStyle(text);
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const anchor = text.getAttribute('text-anchor');
      ctx.textAlign = anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left';
      ctx.textBaseline = 'alphabetic';
      const tspans = [...text.querySelectorAll('tspan')];
      const ink = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
      for (const line of tspans.length > 0 ? tspans : [text]) {
        const x = Number(line.getAttribute('x') ?? text.getAttribute('x'));
        const y = Number(line.getAttribute('y') ?? text.getAttribute('y'));
        const m = ctx.measureText(line.textContent);
        ink.left = Math.min(ink.left, x - m.actualBoundingBoxLeft);
        ink.right = Math.max(ink.right, x + m.actualBoundingBoxRight);
        ink.top = Math.min(ink.top, y - m.actualBoundingBoxAscent);
        ink.bottom = Math.max(ink.bottom, y + m.actualBoundingBoxDescent);
      }
      const r = (g.querySelector('rect') as SVGRectElement).getBBox();
      return {
        rect: { left: r.x, right: r.x + r.width, top: r.y, bottom: r.y + r.height },
        ink,
      };
    });
  }, source);
}

// redux-color as in the issue, and default for the default font (trebuchet ms).
for (const theme of ['redux-color', 'default']) {
  test(`the class relation tags of #1319 centre their ink within 0.5 px (${theme})`, async ({
    page,
  }) => {
    const tags = await measure(page, repro(theme));
    expect(tags).toHaveLength(3);
    for (const { rect, ink } of tags) {
      const dy = (ink.top + ink.bottom) / 2 - (rect.top + rect.bottom) / 2;
      const dx = (ink.left + ink.right) / 2 - (rect.left + rect.right) / 2;
      expect(Math.abs(dy)).toBeLessThan(0.5);
      expect(Math.abs(dx)).toBeLessThan(0.5);
    }
  });
}
