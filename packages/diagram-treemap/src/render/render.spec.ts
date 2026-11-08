/**
 * The treemap renderer's `treemap` options (spec #428 T4) over hand-built models: `showValues`
 * and `useMaxWidth`. The `treemap` config section reaches `render()` only once T5 (#514) adds
 * it to the schema, so these run at the renderer's own seam; everything else is in
 * `packages/conformance/src/treemap/render.spec.ts`, through `createMermaid().render()`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { assertInert, streamWriter } from '@mermaid-js/core/svg';
import type { Theme } from '@mermaid-js/core/theme';
import { context, leaf, model, section } from '../layout/fixtures.ts';
import { layoutTreemap } from '../layout/index.ts';
import { treemapTestTheme } from '../test-context.ts';
import { renderTreemap } from './render.ts';

let theme: Theme;
beforeAll(async () => {
  theme = await treemapTestTheme();
});

const M = model([section('S', leaf('a', 1), leaf('b', 2))]);

function render(treemap: Record<string, unknown> = {}): string {
  const ctx = context(theme, treemap);
  const w = streamWriter();
  renderTreemap(
    M,
    layoutTreemap(M, ctx),
    { ...ctx, warn: () => {}, idPrefix: 'x', version: 'test' },
    w
  );
  return w.finish();
}

describe('renderTreemap options', () => {
  it('draws section and leaf values unless showValues is false', () => {
    const on = render();
    expect(on).toContain('class="treemapSectionValue"');
    expect(on).toContain('class="treemapValue"');
    const off = render({ showValues: false });
    expect(off).not.toContain('Value"');
    expect(off.match(/class="treemapLabel"/g)).toHaveLength(2);
    expect(() => assertInert(off)).not.toThrow();
  });

  it('sizes the root to 100% under useMaxWidth (the default), to the viewBox without', () => {
    expect(render()).toMatch(/ width="100%"[^>]* style="max-width:\d+px/);
    const fixed = render({ useMaxWidth: false });
    const [, w, h] = / viewBox="[-\d.]+ [-\d.]+ (\d+) (\d+)"/.exec(fixed)!;
    expect(fixed).toContain(` width="${w}" height="${h}"`);
    expect(fixed).not.toContain('max-width');
  });
});
