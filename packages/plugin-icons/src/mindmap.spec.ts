// Mindmap `::icon()` glyphs with the icons extension (#328, D286, D291, D297, D299), through the
// API: the glyph in its section's `cScaleLabel` colour, the reference as written when it does not
// resolve (the extension's one `ICON_NOT_RENDERED` names it), an empty slot while the pack loads.
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid, type Mermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { icons } from './index.ts';

const mdi = {
  prefix: 'mdi',
  width: 24,
  height: 24,
  icons: { fire: { body: '<path fill="currentColor" d="M0 0H5V24z"/>' } },
};

async function api(): Promise<Mermaid> {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  await m.registerExternalDiagrams([icons]);
  m.registerIconPacks([{ name: 'mdi', loader: () => Promise.resolve(mdi) }]);
  await m.preload({ types: ['mindmap'] });
  return m;
}

const codes = (r: { warnings: readonly { code: string }[] }) => r.warnings.map((w) => w.code);
const THEMED =
  '---\nconfig:\n  theme: default\n  themeVariables:\n    cScaleLabel1: "#123456"\n---\n';

describe('mindmap ::icon() with the icons extension', () => {
  it('draws the glyph, 40 px in its slot, in the label colour, with no warning', async () => {
    const m = await api();
    const r = await m.render('x', `${THEMED}mindmap\nroot\n  a\n  ::icon(mdi mdi-fire)`, {
      config: { output: { cssVariables: false } },
    });
    expect(codes(r)).toEqual([]);
    expect(r.svg).toMatch(
      /<g class="mindmap-icon" transform="translate\([\d.]+,[\d.]+\)"><g transform="scale\(1\.666667\)" color="#123456"><path fill="currentColor" d="M0 0H5V24z"\/>/
    );
    expect(r.svg).not.toMatch(/mdi-fire/);
    assertInert(r.svg);
  });

  it('shows an unresolved icon as written, and names it in the one ICON_NOT_RENDERED', async () => {
    const m = await api();
    const r = await m.render(
      'x',
      'mindmap\nroot\n  a\n  ::icon(mdi:nope)\n  b\n  ::icon(mdi:fire)'
    );
    expect(codes(r)).toEqual(['ICON_NOT_RENDERED']);
    expect(r.warnings[0]!.message).toContain('mdi:nope');
    expect(r.svg).toMatch(/<text class="mindmap-icon"[^>]*>mdi:nope</);
    expect(r.svg.match(/<g class="mindmap-icon"/g)).toHaveLength(1);
  });

  it('leaves the slot empty in a placeholder render while the pack loads (D299)', async () => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    await m.registerExternalDiagrams([icons]);
    m.registerIconPacks([{ name: 'mdi', loader: () => Promise.resolve(mdi) }]);
    await m.preload({ types: ['mindmap'] });
    const r = m.renderSync('mindmap\nroot\n  a\n  ::icon(mdi:fire)', { placeholders: true });
    expect(codes(r)).toEqual(['PLACEHOLDER']);
    expect(r.svg).not.toMatch(/mindmap-icon/);
  });
});
