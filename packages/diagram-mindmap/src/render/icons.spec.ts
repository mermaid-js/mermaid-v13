// `::icon()` glyphs (#328, D286, D291, D292, D297) through the renderer's seam: a render context
// whose `icon` stands in for an icons extension's glyphs (core's `RenderContext.icon`). The glyph
// is drawn in the slot the layout reserved, 40 px, painted `cScaleLabel<section>`; what the
// extension does not draw keeps the reference as written. Without an extension: `render.spec.ts`.
import type { RenderContext } from '@mermaid-js/core';
import type { OutlinePaint } from '@mermaid-js/core/svg';
import type { SvgFragment } from '@mermaid-js/core/text';
import { describe, expect, it } from 'vitest';
import { renderMindmapForTest } from './harness.ts';

interface Asked {
  name: string;
  size: number;
  paint?: OutlinePaint;
}

/** A resolver that draws every name but `nope` (null: unresolved) and `later` (a placeholder). */
function resolver(asked: Asked[] = []): NonNullable<RenderContext['icon']> {
  return (name, size, options) => {
    asked.push({ name, size, paint: options?.paint });
    if (name === 'nope') return null;
    if (name === 'later') return undefined;
    const glyph: SvgFragment = {
      tag: 'rect',
      attrs: { class: 'fixture-glyph', width: size, height: size },
    };
    return glyph;
  };
}

const SOURCE = 'mindmap\nroot((Root))\n::icon(mdi:fire)\n  a\n  ::icon(fa fa-book)\n  b\n';
const THEMED = {
  theme: 'default',
  themeVariables: { cScaleLabel1: '#123456' },
};
const RE_GLYPH =
  /<g class="mindmap-icon" transform="translate\((-?[\d.]+),(-?[\d.]+)\)"><rect class="fixture-glyph" width="(\d+)"/g;

describe('::icon() glyphs (D297)', () => {
  it("asks the extension for each icon by its D297 name, 40 px, in the label's slot colour", async () => {
    const asked: Asked[] = [];
    await renderMindmapForTest(SOURCE, { config: THEMED, icon: resolver(asked) });
    expect(asked.map(({ name, size }) => ({ name, size }))).toEqual([
      { name: 'mdi:fire', size: 40 },
      { name: 'fa:book', size: 40 },
    ]);
    expect(asked[1]!.paint).toBe('#123456');
  });

  it('draws each glyph in its slot instead of the reference, with no warning', async () => {
    const r = await renderMindmapForTest(SOURCE, { config: THEMED, icon: resolver() });
    expect(r.svg).not.toMatch(/<text class="mindmap-icon"/);
    expect(r.svg).not.toMatch(/fa fa-book|mdi:fire/);
    expect(r.warnings).toEqual([]);
    const drawn = [...r.svg.matchAll(RE_GLYPH)].map((m) => m.slice(1).map(Number));
    expect(drawn).toHaveLength(2);
    // Each glyph's square is centred on its slot: the circle's above its label, the other's left.
    r.layout.mindmap.nodes.slice(0, 2).forEach((v, k) => {
      const at = r.layout.nodes.get(v.id)!;
      const [x, y, size] = drawn[k]!;
      expect(size).toBe(40);
      expect(x! + 20).toBeCloseTo(at.x + v.frame.dx + v.icon!.at.x, 1);
      expect(y! + 20).toBeCloseTo(at.y + v.frame.dy + v.icon!.at.y, 1);
    });
    const [root, a] = r.layout.mindmap.nodes;
    expect(root!.icon!.at.y).toBeLessThan(root!.labelAt.y);
    expect(a!.icon!.at.x).toBeLessThan(a!.labelAt.x);
  });

  it('keeps the layout: the glyph goes in the slot reserved without one', async () => {
    const without = await renderMindmapForTest(SOURCE, { config: THEMED });
    const withGlyphs = await renderMindmapForTest(SOURCE, { config: THEMED, icon: resolver() });
    expect(withGlyphs.layout.mindmap.nodes).toEqual(without.layout.mindmap.nodes);
    expect(withGlyphs.layout.width).toBe(without.layout.width);
    expect(withGlyphs.layout.height).toBe(without.layout.height);
  });

  it('shows an unresolved icon as written, and leaves the warning to the extension (D291)', async () => {
    const src = 'mindmap\nroot\n  a\n  ::icon(nope)\n  b\n  ::icon(fa fa-book)\n';
    const r = await renderMindmapForTest(src, { config: THEMED, icon: resolver() });
    expect(r.svg).toMatch(/<text class="mindmap-icon"[^>]*>nope</);
    expect([...r.svg.matchAll(RE_GLYPH)]).toHaveLength(1);
    expect(r.warnings).toEqual([]);
  });

  it('leaves the slot empty, quietly, while the pack loads (a placeholder, D299)', async () => {
    const src = 'mindmap\nroot\n  a\n  ::icon(later)\n';
    const r = await renderMindmapForTest(src, { config: THEMED, icon: resolver() });
    expect(r.svg).not.toMatch(/mindmap-icon/);
    expect(r.svg).not.toMatch(/later/);
    expect(r.warnings).toEqual([]);
  });
});
