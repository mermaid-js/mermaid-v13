import { describe, expect, it } from 'vitest';
import { createTheme, loadTheme, THEME_NAMES, type ThemeSpec } from '@mermaid-js/core/theme';
import { packet } from './plugin.ts';

/**
 * Packet's theme table (spec #421 "v13 entries", D331, D335, D540) through `createTheme`: the
 * light entry in every light theme, the dark entry in every dark one, v12's lengths everywhere,
 * and `themeVariables.packet.*` key by key.
 */
const specs = Object.fromEntries(
  await Promise.all(THEME_NAMES.map(async (n) => [n, await loadTheme(n)] as const))
) as Record<(typeof THEME_NAMES)[number], ThemeSpec>;

const INKS = [
  'packetStartByteColor',
  'packetEndByteColor',
  'packetLabelColor',
  'packetTitleColor',
  'packetBlockStrokeColor',
] as const;
const LENGTHS = [
  'packetByteFontSize',
  'packetLabelFontSize',
  'packetTitleFontSize',
  'packetBlockStrokeWidth',
] as const;

const lit = (s: ThemeSpec, themeVariables?: Record<string, unknown>) =>
  createTheme(s, { cssVariables: false, diagram: packet.theme, themeVariables });
const colours = (s: ThemeSpec, tv?: Record<string, unknown>) => {
  const t = lit(s, tv);
  return [...INKS.map((n) => t.value(n)), t.value('packetBlockFillColor')];
};

describe('packet theme table', () => {
  it('declares v12’s ten packet keys under section packet', () => {
    expect(packet.theme.section).toBe('packet');
    expect(
      Object.fromEntries(Object.entries(packet.theme.vars).map(([k, v]) => [k, v.nested]))
    ).toEqual({
      packetStartByteColor: 'startByteColor',
      packetEndByteColor: 'endByteColor',
      packetLabelColor: 'labelColor',
      packetTitleColor: 'titleColor',
      packetBlockStrokeColor: 'blockStrokeColor',
      packetBlockFillColor: 'blockFillColor',
      packetByteFontSize: 'byteFontSize',
      packetLabelFontSize: 'labelFontSize',
      packetTitleFontSize: 'titleFontSize',
      packetBlockStrokeWidth: 'blockStrokeWidth',
    });
  });

  it('gives every light theme v12’s black on #efefef, forest included (D541)', () => {
    for (const n of THEME_NAMES.filter((t) => !specs[t].dark))
      expect(colours(specs[n]), n).toEqual([...INKS.map(() => 'black'), '#efefef']);
  });

  it('gives v12 dark’s colours: primaryTextColor inks on background', () => {
    expect(colours(specs.dark)).toEqual([...INKS.map(() => '#e0dfdf'), '#333333']);
  });

  it('gives every dark theme the dark entry, by trait (D333(b))', () => {
    const dark = THEME_NAMES.filter((n) => specs[n].dark);
    expect(dark).toEqual(
      expect.arrayContaining(['dark', 'neo-dark', 'redux-dark', 'redux-dark-color'])
    );
    for (const n of dark) {
      const t = lit(specs[n]);
      expect(colours(specs[n]), n).toEqual([
        ...INKS.map(() => t.value('primaryTextColor')),
        t.value('background'),
      ]);
    }
  });

  it('keeps the light colours under an author’s darkMode on a light theme, as v12', () => {
    expect(colours(specs.base, { darkMode: true })).toEqual([
      ...INKS.map(() => 'black'),
      '#efefef',
    ]);
  });

  it('uses v12’s lengths in every theme', () => {
    for (const n of THEME_NAMES) {
      const t = lit(specs[n]);
      expect(
        LENGTHS.map((l) => t.number(l)),
        n
      ).toEqual([10, 12, 14, 1]);
    }
  });

  it('maps themeVariables.packet.* key by key, the flat name winning (D335, D540)', () => {
    // v12: `dark` with `packet: { startByteColor: 'red' }` keeps the other five dark colours.
    expect(colours(specs.dark, { packet: { startByteColor: 'red' } })).toEqual([
      'red',
      ...INKS.slice(1).map(() => '#e0dfdf'),
      '#333333',
    ]);
    const t = lit(specs.default, {
      packet: { labelColor: '#111111', labelFontSize: '16px', blockFillColor: '#222222' },
      packetBlockFillColor: '#333333',
    });
    expect([t.value('packetLabelColor'), t.number('packetLabelFontSize')]).toEqual(['#111111', 16]);
    expect(t.value('packetBlockFillColor')).toBe('#333333');
  });
});
