/**
 * The renderer reads its lengths in the render's units (`ctx.units`), as the layout did, not
 * from a fixed px profile (spec #125 final review, finding 11).
 */
import type { DiagramPlugin } from '@mermaid-js/core';
import { describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { cellProfile, pxProfile } from '@mermaid-js/core/layout';
import type { UnitProfile } from '@mermaid-js/core/layout';
import { streamWriter } from '@mermaid-js/core/svg';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme } from '@mermaid-js/core/theme';
import { layoutSequence } from '../layout/index.ts';
import { parseSequence } from '../parser/index.ts';
import { renderSequence } from './render.ts';
import { sequence as diagramPlugin } from '../plugin.ts';

/** The diagram's own theme table (D331), passed to `createTheme` as the pipeline does. */
const { theme: diagramTheme }: Pick<DiagramPlugin, 'id' | 'theme'> = diagramPlugin;

async function svgWith(units: UnitProfile): Promise<string> {
  const theme = createTheme(await loadTheme('default'), { diagram: diagramTheme });
  const config = { sequence: { showSequenceNumbers: true } } as unknown as ResolvedConfig;
  const { model } = parseSequence('sequenceDiagram\nA->>B: hi');
  const ctx = { config, theme, units, warn: () => {}, idPrefix: 's', version: '13' };
  const layout = layoutSequence(model, { ...ctx, measurer: tableMeasurer, units: pxProfile });
  const w = streamWriter();
  renderSequence(model, layout, ctx, w);
  return w.finish();
}

describe('renderSequence lengths', () => {
  it('come from the render context units', async () => {
    const px = await svgWith(pxProfile);
    expect(px).toMatch(/<circle[^>]* r="12"/);
    // Same layout, cell units: the badge radius is the cell table's, so the units were read.
    expect(await svgWith(cellProfile())).not.toBe(px);
  });
});

const ALIGN_SOURCE = `sequenceDiagram
  A->>B: a fairly long message line one<br>short
  Note over A,B: a note line one that is long<br>short
  A->>B: one line`;

async function alignedSvg(align?: 'left' | 'center' | 'right') {
  const theme = createTheme(await loadTheme('default'), { diagram: diagramTheme });
  const sequence = align === undefined ? {} : { messageAlign: align, noteAlign: align };
  const config = { sequence } as unknown as ResolvedConfig;
  const { model } = parseSequence(ALIGN_SOURCE);
  const ctx = { config, theme, units: pxProfile, warn: () => {}, idPrefix: 's', version: '13' };
  const layout = layoutSequence(model, { ...ctx, measurer: tableMeasurer });
  const w = streamWriter();
  renderSequence(model, layout, ctx, w);
  return { svg: w.finish(), layout };
}

/** The `<text>` of each label with class `cls`: its anchor and each line's x. */
function texts(svg: string, cls: string): { anchor: string; xs: number[] }[] {
  const re = new RegExp(`<text[^>]*class="${cls}"[^>]*>(.*?)</text>`, 'g');
  return [...svg.matchAll(re)].map(([whole, body = '']) => {
    const head = whole.slice(0, whole.indexOf('>'));
    const xs = body.includes('<tspan')
      ? [...body.matchAll(/<tspan[^>]* x="([^"]+)"/g)].map((m) => Number(m[1]))
      : [Number(/ x="([^"]+)"/.exec(head)?.[1])];
    return { anchor: /text-anchor="([^"]+)"/.exec(head)?.[1] ?? '', xs };
  });
}

describe('messageAlign and noteAlign (#1241)', () => {
  it('left: every line of a multi-line message and note starts at the left edge of its box', async () => {
    const { svg, layout } = await alignedSvg('left');
    const message = layout.messages[0]!.label!;
    const note = layout.notes[0]!.label;
    expect(texts(svg, 'messageText')[0]).toEqual({ anchor: 'start', xs: [message.x, message.x] });
    expect(texts(svg, 'noteText')[0]).toEqual({ anchor: 'start', xs: [note.x, note.x] });
  });

  it('right: every line of a multi-line message and note ends at the right edge of its box', async () => {
    const { svg, layout } = await alignedSvg('right');
    const drawn = [texts(svg, 'messageText')[0]!, texts(svg, 'noteText')[0]!];
    const boxes = [layout.messages[0]!.label!, layout.notes[0]!.label];
    drawn.forEach((d, i) => {
      const box = boxes[i]!;
      expect(d.anchor).toBe('start');
      // The short second line is narrower than the box: it starts further right.
      expect(d.xs[1]).toBeGreaterThan(d.xs[0]!);
      // The writer rounds each x to 0.01.
      for (const [j, x] of d.xs.entries())
        expect(x + box.text.widths[j]!).toBeCloseTo(box.x + box.width, 2);
    });
  });

  it('center is the default and draws each line centred', async () => {
    const centre = await alignedSvg('center');
    expect(centre.svg).toBe((await alignedSvg()).svg);
    expect(texts(centre.svg, 'messageText')[0]!.anchor).toBe('middle');
    expect(texts(centre.svg, 'noteText')[0]!.anchor).toBe('middle');
  });

  it('a one-line message keeps its centred text for every alignment', async () => {
    for (const align of ['left', 'right'] as const) {
      expect(texts((await alignedSvg(align)).svg, 'messageText')[1]!.anchor).toBe('middle');
    }
  });
});
