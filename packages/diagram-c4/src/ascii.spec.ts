import { beforeAll, describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import { cellMeasurer, unicode } from '@mermaid-js/core/ascii';
import { cellProfile } from '@mermaid-js/core/layout';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import { ascii } from './ascii.ts';
import { c4CellRect, drawC4 } from './ascii/draw.ts';
import { layoutC4, type C4Layout } from './layout/index.ts';
import { c4TestContext, parsedC4 } from './test-context.ts';

/**
 * The C4 text output's seams (#545, D459): the layout on the cell profile (`layout/cells.ts`),
 * the `ascii` hook, and `drawC4` on a hand-changed layout. The corpus properties and the API's
 * exact output are in `conformance/src/c4/ascii-corpus.spec.ts` and `mermaid/src/c4.spec.ts`.
 */
let theme: Theme;
beforeAll(async () => {
  theme = createTheme(await loadTheme('default'));
});

const SRC = [
  'C4Context',
  'Person(a, "Alice")',
  'System(b, "Billing", "Takes the money")',
  'Rel(a, b, "Pays")',
].join('\n');

function context(src: string, warnings: Warning[] = [], integrator?: Record<string, unknown>) {
  const parsed = parsedC4(src, integrator);
  return { parsed, ctx: c4TestContext(parsed.config, theme, warnings) };
}

describe('the C4 layout on the cell profile (#545)', () => {
  it('measures text in cells of 8 × 16 px and says so; the px layout has no `cell`', () => {
    const { parsed, ctx } = context(SRC);
    const px = layoutC4(parsed.model, ctx);
    expect(px.cell).toBeUndefined();
    const cells = layoutC4(parsed.model, {
      ...ctx,
      measurer: cellMeasurer,
      units: cellProfile(),
    });
    expect(cells.cell).toEqual({ x: 8, y: 16 });
    // "Alice": five cells of 8 px; one row of 16 px.
    const name = cells.elements[0]!.name!;
    expect([name.width, name.height]).toEqual([40, 16]);
  });

  it('raises a padding under a border’s room once, with C4_CONFIG_IGNORED', () => {
    const warnings: Warning[] = [];
    const { parsed, ctx } = context(SRC, warnings, { c4: { c4ShapePadding: 4 } });
    layoutC4(parsed.model, { ...ctx, measurer: cellMeasurer, units: cellProfile() });
    expect(warnings.map((w) => [w.code, w.path])).toEqual([
      ['C4_CONFIG_IGNORED', 'c4.c4ShapePadding'],
    ]);
    // `roomy` adds a row first: 4 + 16 is room enough.
    warnings.length = 0;
    layoutC4(parsed.model, { ...ctx, measurer: cellMeasurer, units: cellProfile('roomy') });
    expect(warnings).toEqual([]);
  });
});

describe('the C4 ascii hook (#545)', () => {
  it('draws the cell layout the API hands it, and refuses a px one', () => {
    const { parsed, ctx } = context(SRC);
    const cells = layoutC4(parsed.model, { ...ctx, measurer: cellMeasurer, units: cellProfile() });
    const text = ascii(parsed.model, cells, { config: ctx.config, warn: () => undefined });
    for (const part of ['Alice', '[Person]', 'Billing', 'Pays', '►']) expect(text).toContain(part);
    const px = layoutC4(parsed.model, ctx);
    expect(() => ascii(parsed.model, px, { config: ctx.config, warn: () => undefined })).toThrow(
      /cell profile/
    );
  });

  it('routes a relation round an element in its way, never under it', () => {
    const src = [
      'C4Context',
      'System(a, "A")',
      'System(b, "B")',
      'System(c, "C")',
      'Rel(a, c, "Skips")',
    ].join('\n');
    const { parsed, ctx } = context(src);
    const laid = layoutC4(parsed.model, { ...ctx, measurer: cellMeasurer, units: cellProfile() });
    const drawing = drawC4(laid, unicode);
    const b = c4CellRect(laid, laid.elements[1]!.box);
    const inB = drawing.lines[0]!.cells.filter(
      (p) =>
        p.x + drawing.left >= b.x &&
        p.x + drawing.left < b.x + b.width &&
        p.y + drawing.top >= b.y &&
        p.y + drawing.top < b.y + b.height
    );
    expect(inB).toEqual([]);
    expect(drawing.text).toContain('Skips');
  });

  it('cuts a line wider than its box with …', () => {
    const { parsed, ctx } = context(SRC);
    const laid = layoutC4(parsed.model, { ...ctx, measurer: cellMeasurer, units: cellProfile() });
    const b = laid.elements[1]!;
    // Twelve cells wide: eight inside a border and a space each side.
    const narrow: C4Layout = {
      ...laid,
      relations: [],
      elements: [laid.elements[0]!, { ...b, box: { ...b.box, width: 12 * 8 } }],
    };
    const text = drawC4(narrow, unicode).text;
    expect(text).toContain('│ Billing  │');
    expect(text).toContain('│ [Softwa… │');
    expect(text).toContain('│ Takes t… │');
  });
});
