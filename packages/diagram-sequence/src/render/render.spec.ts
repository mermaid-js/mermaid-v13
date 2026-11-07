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
