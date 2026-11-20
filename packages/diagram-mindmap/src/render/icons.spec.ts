// `::icon()` glyphs (#328, D286, D291, D292, D297) through the renderer's seam: a render context
// whose `icon` stands in for an icons extension's glyphs (core's `RenderContext.icon`). The glyph
// is drawn in the slot the layout reserved, 40 px, painted `cScaleLabel<section>`; what the
// extension does not draw keeps the reference as written. Without an extension: `render.spec.ts`.
import type { IconPacks, IconPackState, RenderContext } from '@mermaid-js/core';
import type { OutlinePaint } from '@mermaid-js/core/svg';
import type { SvgFragment } from '@mermaid-js/core/text';
import { describe, expect, it } from 'vitest';
import { renderMindmapForTest } from './harness.ts';

/** What the stand-in lookup reads of its options. */
interface Options {
  readonly paint?: OutlinePaint;
  readonly pending?: true;
}

interface Asked {
  name: string;
  size: number;
  paint?: OutlinePaint;
}

/**
 * A resolver that draws every name but `<pack>:nope` (null: unresolved) and those of packs `later` and
 * `other` (`undefined`: no glyph for it). As core's lookup does, it gives `'pending'` (a placeholder)
 * for a name of a pack in `loading` when the caller asks with `pending: true`.
 */
function resolver(
  asked: Asked[] = [],
  loading: readonly string[] = []
): NonNullable<RenderContext['icon']> {
  return ((name: string, size: number, options?: Options) => {
    asked.push({ name, size, paint: options?.paint });
    if (name.endsWith(':nope')) return null;
    if (options?.pending && loading.includes(name.slice(0, name.indexOf(':')))) return 'pending';
    if (/^(later|other):/.test(name)) return undefined;
    const glyph: SvgFragment = {
      tag: 'rect',
      attrs: { class: 'fixture-glyph', width: size, height: size },
    };
    return glyph;
  }) as NonNullable<RenderContext['icon']>;
}

/** Registered packs in the given states (`RenderContext.iconPacks`, D294). */
function packs(states: Record<string, IconPackState>): IconPacks {
  return {
    names: () => Object.keys(states),
    state: (name) => states[name],
    get: () => undefined,
    error: () => undefined,
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
    const src = 'mindmap\nroot\n  a\n  ::icon(mdi:nope)\n  b\n  ::icon(fa fa-book)\n';
    const r = await renderMindmapForTest(src, { config: THEMED, icon: resolver() });
    expect(r.svg).toMatch(/<text class="mindmap-icon"[^>]*>mdi:nope</);
    expect([...r.svg.matchAll(RE_GLYPH)]).toHaveLength(1);
    expect(r.warnings).toEqual([]);
  });

  it('shows a name no extension has a glyph for as written, with one ICON_NOT_RENDERED', async () => {
    // `undefined` without a loading pack: another glyph extension, or none with this name.
    const src = 'mindmap\nroot\n  a\n  ::icon(other:x)\n  b\n  ::icon(other:y)\n';
    const r = await renderMindmapForTest(src, { config: THEMED, icon: resolver() });
    expect(r.svg.match(/<text class="mindmap-icon"[^>]*>other:[xy]</g)).toHaveLength(2);
    expect(r.warnings.map((w) => w.code)).toEqual(['ICON_NOT_RENDERED']);
  });

  it('leaves the slot empty, quietly, while the pack loads (a placeholder, D299)', async () => {
    const src = 'mindmap\nroot\n  a\n  ::icon(later:fire)\n';
    const r = await renderMindmapForTest(src, {
      config: THEMED,
      icon: resolver([], ['later']),
      iconPacks: packs({ later: 'pending' }),
    });
    expect(r.svg).not.toMatch(/mindmap-icon/);
    expect(r.svg).not.toMatch(/later/);
    expect(r.warnings).toEqual([]);
  });

  it('shows a pack that failed to load as written, with one ICON_NOT_RENDERED', async () => {
    const src = 'mindmap\nroot\n  a\n  ::icon(later:fire)\n';
    const r = await renderMindmapForTest(src, {
      config: THEMED,
      icon: resolver(),
      iconPacks: packs({ later: 'failed' }),
    });
    expect(r.svg).toMatch(/<text class="mindmap-icon"[^>]*>later:fire</);
    expect(r.warnings.map((w) => w.code)).toEqual(['ICON_NOT_RENDERED']);
  });

  it('never asks for a reference D297 does not name, and shows it as written (fa-book)', async () => {
    const asked: Asked[] = [];
    const src =
      'mindmap\nroot\n  a\n  ::icon(fa-book)\n  b\n  ::icon(mdi-fire)\n  c\n  ::icon(mdi:fire)\n';
    const r = await renderMindmapForTest(src, { config: THEMED, icon: resolver(asked) });
    expect(asked.map((a) => a.name)).toEqual(['mdi:fire']);
    expect(r.svg).toMatch(/<text class="mindmap-icon"[^>]*>fa-book</);
    expect(r.svg).toMatch(/<text class="mindmap-icon"[^>]*>mdi-fire</);
    expect([...r.svg.matchAll(RE_GLYPH)]).toHaveLength(1);
    expect(r.warnings.map((w) => w.code)).toEqual(['ICON_NOT_RENDERED']);
  });
});
