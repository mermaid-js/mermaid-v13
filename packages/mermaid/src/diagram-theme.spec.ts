/**
 * A diagram plugin's own theme table (D331, spec #414 T0a) through `createMermaid().render()`:
 * its variables resolve for its renders only, keyed by the theme's family, with nested sections
 * (D335, D540), and beat a fragment rule of the same name (D337).
 */
import { describe, expect, it } from 'vitest';
import type { DiagramPlugin, RenderContext } from '@mermaid-js/core';
import { styleText, type SvgWriter } from '@mermaid-js/core/svg';
import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { createMermaid, type ExtensionPlugin } from './index.ts';

const theme: DiagramThemeTable = {
  section: 'demo',
  vars: {
    demoFill: { alias: 'dmf', kind: 'color', nested: 'fill' },
    demoGap: { alias: 'dmg', kind: 'length' },
  },
  rules: { light: { demoFill: 'mainBkg' } },
  families: {
    classic: { tokens: { demoGap: 4 } },
    redux: { tokens: { demoGap: 8 }, dark: { values: { demoFill: '#222222' } } },
    neo: { fallback: 'redux' },
  },
};

/** A diagram that paints one rect in `demoFill` and reports `demoGap`. */
const demo = (table: DiagramThemeTable | null): DiagramPlugin => ({
  id: 'demo',
  detector: (text) => /^\s*demo\b/.test(text),
  layoutKind: 'custom',
  ...(table ? { theme: table } : {}),
  parse: () => ({ model: {}, diagnostics: [] }) as never,
  render(_m: unknown, _l: unknown, ctx: RenderContext, w: SvgWriter) {
    const width = ctx.theme.number('demoGap');
    const fill = ctx.theme.color('demoFill');
    w.open('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: [0, 0, 10, 10],
      style: styleText({}, ctx.theme.rootStyleText()),
    });
    w.leaf('rect', { width, height: 1, fill });
    w.close();
  },
});

async function api(table: DiagramThemeTable | null = theme, init: Record<string, unknown> = {}) {
  const m = createMermaid();
  await m.registerExternalDiagrams([demo(table)]);
  m.initialize({ deterministic: true, ...init });
  return m;
}

describe('DiagramPlugin.theme (D331)', () => {
  it("resolves the plugin's variables in its render, by family", async () => {
    const m = await api();
    const { svg } = await m.render('a', 'demo');
    expect(svg).toContain('fill="var(--_dmf)"');
    expect(svg).toContain('--_dmf:var(--mermaid-demoFill,var(--_mb))');
    expect(svg).toContain('width="8"');
    const classic = await (await api(theme, { theme: 'base' })).render('a', 'demo');
    expect(classic.svg).toContain('width="4"');
    const neoDark = await (await api(theme, { theme: 'neo-dark' })).render('a', 'demo');
    expect(neoDark.svg).toContain('--_dmf:var(--mermaid-demoFill,#222222)');
  });

  it('maps a nested section onto the flat names, and the flat name wins (D540)', async () => {
    const nested = await api(theme, { themeVariables: { demo: { fill: '#123456' } } });
    expect((await nested.render('a', 'demo')).svg).toContain('var(--mermaid-demoFill,#123456)');
    const both = await api(theme, {
      themeVariables: { demoFill: '#abcdef', demo: { fill: '#123456' } },
    });
    expect((await both.render('a', 'demo')).svg).toContain('var(--mermaid-demoFill,#abcdef)');
  });

  it('beats a fragment rule of the same name (D337)', async () => {
    const m = await api();
    const ext: ExtensionPlugin = {
      id: 'ext',
      config: { id: 'ext', keys: {}, themeVariables: { demoFill: 'red' } },
    };
    await m.registerExternalDiagrams([ext]);
    expect((await m.render('a', 'demo')).svg).toContain(
      '--_dmf:var(--mermaid-demoFill,var(--_mb))'
    );
  });

  it('defines nothing for a diagram without a table, or for another diagram', async () => {
    // Without its table the diagram's variables are unknown, so the render fails.
    await expect((await api(null)).render('a', 'demo')).rejects.toThrow(/Unknown theme variable/);
    const m = await api();
    const flow = await m.render('b', 'flowchart LR\n  A --> B');
    expect(flow.svg).not.toContain('--_dmf');
  });
});
