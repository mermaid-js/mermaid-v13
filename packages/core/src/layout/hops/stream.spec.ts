// D537: line hops never need the tree writer. `drawDiagram` with a hopping plugin and no
// `postRender` hook keeps the stream writer.
import { describe, expect, it, vi } from 'vitest';
import { drawDiagram } from '../../pipeline/draw.ts';
import type { DiagramPlugin, RenderContext } from '../../pipeline/types.ts';
import * as writer from '../../svg/writer.ts';
import { hopPlugin } from './index.ts';

vi.mock(import('../../svg/writer.ts'), async (original) => {
  const m = await original();
  return { ...m, treeWriter: vi.fn(m.treeWriter) };
});

const probe = {
  id: 'probe',
  layoutKind: 'custom',
  render: (model: string[], _layout: unknown, _ctx: RenderContext, w: writer.SvgWriter) => {
    w.open('svg', { viewBox: '0 0 100 100' } as never);
    for (const d of model) w.outline('edge', 'path', { d: d as never });
    w.close();
  },
} as unknown as DiagramPlugin<string[], undefined>;

const ctx = {
  theme: { gradient: () => undefined, autoDeclarations: () => undefined },
  units: { id: 'px' },
  limits: { maxOutputLength: 1e6 },
  idPrefix: 'd',
} as unknown as RenderContext;

describe('line hops and the writer backings (D537)', () => {
  it('a render with hops keeps the stream writer', () => {
    const { svg } = drawDiagram(hopPlugin(probe, 'arc'), ['M0,50L100,50', 'M50,0L50,100'], ctx);
    expect(svg).toContain('A6,6');
    expect(writer.treeWriter).not.toHaveBeenCalled();
  });
});
