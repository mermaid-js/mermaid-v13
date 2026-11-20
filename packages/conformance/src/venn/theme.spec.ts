/**
 * #495: venn's colours against what v12 12.2.0 draws, in all eleven themes (D151: v12 is the
 * oracle). v12's renderer reads `getConfig().themeVariables` (`vennRenderer.ts` lines 41-50, 86,
 * 120, 128-129 and 163-164): each drawn set `i` takes the `i % n`th of the `venn1`–`venn8` it
 * finds, else
 * `primaryColor`; its label lightens that colour by 30 when `background` is dark and darkens it
 * otherwise (khroma); the title is `vennTitleTextColor`, overlap labels and text nodes
 * `vennSetTextColor`. v13 resolves the same through the plugin's table (`theme/table.ts`) and
 * its paints (`vennPaints`). Colours compare as hex.
 *
 * Every slot that differs is in `DIFFERENCES` with the decision that makes it, and the list has to
 * match the differences found exactly, so none is unlisted and none is stale: D415's classic
 * light approximation (`base` and `forest`: `venn3` only; `neutral`: all eight slots) and D333(a)'s
 * rounding in `default`'s `venn3`.
 *
 * #501: with no theme set, both resolve venn's own default, `venn.theme: redux-color`, and a
 * theme from `initialize()` or the front matter wins over it.
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { THEME_NAMES, createTheme, loadTheme, type ThemeName } from '@mermaid-js/core/theme';
import { venn } from '@mermaid-js/diagram-venn';
import { createMermaid } from 'mermaid';
import { vennPaints } from '@mermaid-js/diagram-venn/testing';
import { hex } from '../hex.ts';
import { loadOracle } from '../oracle.ts';
import { v12, v12Vars } from '../v12-theme.ts';

const oracle = await loadOracle();
/** khroma, as v12 resolves it (a dependency of `mermaid@12.2.0`, not of conformance). */
const khroma = createRequire(createRequire(import.meta.url).resolve('mermaid-v12'))('khroma') as {
  isDark(c: string): boolean;
  lighten(c: string, n: number): string;
  darken(c: string, n: number): string;
};

const SLOTS = 8;
/** Set indexes 0–9: the eight slots and two past them, where v12 starts again at `venn1`. */
const INDEXES = Array.from({ length: SLOTS + 2 }, (_, i) => i);

/** What v12 draws: each set's circle and label colour, the title and the set ink. */
function v12Drawn(vars: Record<string, unknown>): Record<string, string | undefined> {
  const slots = Array.from({ length: SLOTS }, (_, i) => vars[`venn${i + 1}`] as string).filter(
    Boolean
  );
  const dark = khroma.isDark((vars.background as string) || '#f4f4f4');
  const out: Record<string, string | undefined> = {
    vennTitleTextColor: hex(vars.vennTitleTextColor || vars.titleColor),
    vennSetTextColor: hex(vars.vennSetTextColor),
  };
  for (const i of INDEXES) {
    const base = (slots.length > 0 ? slots[i % slots.length] : undefined) || vars.primaryColor;
    out[`circle${i}`] = hex(base);
    out[`label${i}`] = hex(
      dark ? khroma.lighten(base as string, 30) : khroma.darken(base as string, 30)
    );
  }
  return out;
}

/** What v13 draws, read as v12's above. */
async function v13Drawn(
  name: string,
  themeVariables?: Readonly<Record<string, unknown>>
): Promise<Record<string, string | undefined>> {
  const theme = createTheme(await loadTheme(name as ThemeName), {
    diagram: venn.theme,
    cssVariables: false,
    ...(themeVariables ? { themeVariables } : {}),
  });
  const ctx = {
    config: { themeVariables: themeVariables ?? {} },
    theme,
    idPrefix: 'v',
    version: 'test',
    warn: () => undefined,
  } as unknown as Parameters<typeof vennPaints>[0];
  const paints = vennPaints(ctx);
  const out: Record<string, string | undefined> = {
    vennTitleTextColor: hex(theme.value('vennTitleTextColor')),
    vennSetTextColor: hex(theme.value('vennSetTextColor')),
  };
  for (const i of INDEXES) {
    // The drawn set at index `i`, unstyled.
    const c = paints.circle(undefined, i);
    out[`circle${i}`] = hex(c.fill);
    out[`label${i}`] = hex(c.label);
  }
  return out;
}

const D415 =
  'D415: classic light themes take default’s formula; v12 base and forest darken venn3 by 30, not 40';
const D415_NEUTRAL =
  'D415: classic light themes take default’s formula; v12 neutral read its cScale greys';
const D333A =
  'D333(a): v12 darkened its unrounded HSL tertiaryColor; v13 the hex one (#b9ff20 against #b5ff20)';
/** The slot-derived keys of set index `i` (its circle and label). */
const ofSlot = (theme: string, slot: number, why: string): [string, string][] =>
  INDEXES.flatMap((i): [string, string][] =>
    i % SLOTS === slot
      ? [
          [`${theme}/circle${i}`, why],
          [`${theme}/label${i}`, why],
        ]
      : []
  );

/** `theme/key` → the decision that makes v13 draw it differently from v12. */
const DIFFERENCES: Readonly<Record<string, string>> = Object.fromEntries([
  ...ofSlot('base', 2, D415),
  ...ofSlot('forest', 2, D415),
  ...Array.from({ length: SLOTS }, (_, s) => ofSlot('neutral', s, D415_NEUTRAL)).flat(),
  ...ofSlot('default', 2, D333A),
]);

describe('venn colours against v12 12.2.0 (#495, D415)', () => {
  it('differs from what v12 draws only where D415 says so', async () => {
    const found: string[] = [];
    const detail: string[] = [];
    for (const name of THEME_NAMES) {
      const old = v12Drawn(v12Vars(name));
      const now = await v13Drawn(name);
      for (const key of Object.keys(old))
        if (now[key] !== old[key]) {
          found.push(`${name}/${key}`);
          if (!(`${name}/${key}` in DIFFERENCES))
            detail.push(`${name}/${key}: ${now[key]} vs ${old[key]}`);
        }
    }
    expect(detail).toEqual([]);
    expect(found.sort()).toEqual(Object.keys(DIFFERENCES).sort());
  });

  it('v12 gives eight slots to seven themes and none to redux, redux-dark, neo and neo-dark', () => {
    const none = ['neo', 'neo-dark', 'redux', 'redux-dark'];
    for (const name of THEME_NAMES) {
      const vars = v12Vars(name);
      const slots = Array.from({ length: SLOTS }, (_, i) => vars[`venn${i + 1}`]).filter(Boolean);
      expect(slots.length, name).toBe(none.includes(name) ? 0 : SLOTS);
    }
  });

  // vennPalette.spec.ts: redux-color and redux-dark-color take their categorical palette.
  it.each([['redux-color'], ['redux-dark-color']])(
    '%s: the circles take borderColorArray, eight distinct colours',
    async (name) => {
      const palette = (v12Vars(name).borderColorArray as string[]).map(hex);
      const now = await v13Drawn(name);
      const circles = INDEXES.slice(0, SLOTS).map((i) => now[`circle${i}`]);
      expect(circles).toEqual(palette.slice(0, SLOTS));
      expect(new Set(circles).size).toBe(SLOTS);
    }
  );

  // vennPalette.spec.ts: the four themes without a palette draw one flat colour.
  it.each([['neo'], ['neo-dark'], ['redux'], ['redux-dark']])(
    '%s: every circle is primaryColor',
    async (name) => {
      const now = await v13Drawn(name);
      const circles = new Set(INDEXES.map((i) => now[`circle${i}`]));
      expect([...circles]).toEqual([hex(v12Vars(name).primaryColor)]);
    }
  );

  const FLAT = ['neo', 'neo-dark', 'redux', 'redux-dark'];
  const SLOTTED = THEME_NAMES.filter((n) => !FLAT.includes(n));

  // An author's `venn<k>` wins over the theme's formula and over a palette, as in v12.
  it.each(SLOTTED.map((n) => [n]))(
    '%s: an author’s venn2 recolours slot 1, as in v12',
    async (name) => {
      const author = { venn2: '#123456' };
      const old = v12Drawn(v12Vars(name, author));
      const now = await v13Drawn(name, author);
      const keys = ['circle0', 'label0', 'circle1', 'label1', 'circle9', 'label9'].filter(
        (k) => !(`${name}/${k}` in DIFFERENCES)
      );
      expect(now.circle1).toBe('#123456');
      expect(Object.fromEntries(keys.map((k) => [k, now[k]]))).toEqual(
        Object.fromEntries(keys.map((k) => [k, old[k]]))
      );
    }
  );

  // v12 cycles the `venn*` it finds (`themeColors[i % n]`), so in the four themes that define
  // none an author's lone `venn2` colours every circle, and `venn1` with `venn3` alternate.
  it.each(
    FLAT.flatMap((n) => [
      [n, { venn2: '#123456' }],
      [n, { venn1: '#aa0000', venn3: '#0000aa' }],
    ])
  )('%s %o: the circles cycle the written slots, as in v12', async (name, author) => {
    const old = v12Drawn(v12Vars(name, author));
    const now = await v13Drawn(name, author);
    const keys = Object.keys(old).filter((k) => !(`${name}/${k}` in DIFFERENCES));
    expect(Object.fromEntries(keys.map((k) => [k, now[k]]))).toEqual(
      Object.fromEntries(keys.map((k) => [k, old[k]]))
    );
    const circles = INDEXES.slice(0, 4).map((i) => now[`circle${i}`]);
    expect(circles).toEqual(
      'venn2' in author ? Array(4).fill('#123456') : ['#aa0000', '#0000aa', '#aa0000', '#0000aa']
    );
  });

  // v12 base derives every slot from the author's base colours; the label ink follows an
  // author's dark background.
  it('base: an author’s base colours and background move the slots and inks as in v12', async () => {
    // tertiaryColor too: v12 base derives it from primaryColor, v13 base keeps its own.
    const author = {
      primaryColor: '#aa3366',
      secondaryColor: '#3366aa',
      tertiaryColor: '#66aa33',
      background: '#101010',
    };
    const old = v12Drawn(v12Vars('base', author));
    const now = await v13Drawn('base', author);
    const keys = Object.keys(old).filter((k) => !(`base/${k}` in DIFFERENCES));
    expect(keys.length).toBeGreaterThan(15);
    expect(Object.fromEntries(keys.map((k) => [k, now[k]]))).toEqual(
      Object.fromEntries(keys.map((k) => [k, old[k]]))
    );
    expect(now.label0).toBe(hex(khroma.lighten(v12Vars('base', author).venn1 as string, 30)));
  });

  it('an author’s borderColorArray turns the palette on in any theme (spec #429 “palette on”)', async () => {
    const now = await v13Drawn('default', { borderColorArray: ['#ff0000', '#00ff00', '#0000ff'] });
    expect(INDEXES.map((i) => now[`circle${i}`])).toEqual([
      '#ff0000',
      '#00ff00',
      '#0000ff',
      '#ff0000',
      '#00ff00',
      '#0000ff',
      '#ff0000',
      '#00ff00',
      '#ff0000',
      '#00ff00',
    ]);
  });

  // #501: v12's venn.theme default. v13's global default is redux-color too, so the global
  // default that would win without venn's own is checked in `gen-config/venn-padding.spec.ts`.
  it('takes venn.theme (redux-color) when no theme is set; initialize() and the text win', async () => {
    const SOURCE = 'venn-beta\n  set A\n  set B\n';
    const FRONT = (theme: string) => `---\nconfig:\n  theme: ${theme}\n---\n`;
    /**
     * The theme v12 resolves for a venn diagram: `parse` scopes the config to the detected
     * type, as `render` does, and v12's venn DB (one shared object) reads it mid-parse.
     */
    const v12Theme = async (text: string, config: object): Promise<string | undefined> => {
      const first = await oracle.parse(SOURCE);
      if (!first.accepted) throw new Error(first.error);
      const db = first.db as Record<string, (...args: unknown[]) => unknown>;
      const add = db.addSubsetData!;
      let seen: string | undefined;
      db.addSubsetData = (...args) => {
        seen = v12.mermaidAPI.getConfig().theme;
        return add(...args);
      };
      try {
        v12.mermaidAPI.reset();
        v12.mermaidAPI.initialize(config);
        await v12.parse(text);
      } finally {
        db.addSubsetData = add;
      }
      return seen;
    };
    /** The first circle's fill v13 draws for `text` under `initialize(config)`. */
    const v13Fill = async (text: string, config: object = {}): Promise<string | undefined> => {
      const m = createMermaid();
      m.initialize(config);
      const svg = (await m.render('v', text)).svg;
      return /venn-set-0"[^>]*><path [^>]*fill="([^"]*)"/.exec(svg)?.[1];
    };
    const cases: { name: string; text: string; config: object; expected: ThemeName }[] = [
      { name: 'no theme', text: SOURCE, config: {}, expected: 'redux-color' },
      { name: 'initialize', text: SOURCE, config: { theme: 'dark' }, expected: 'dark' },
      { name: 'front matter', text: FRONT('forest') + SOURCE, config: {}, expected: 'forest' },
      {
        name: 'front matter over initialize',
        text: FRONT('neutral') + SOURCE,
        config: { theme: 'dark' },
        expected: 'neutral',
      },
    ];
    for (const { name, text, config, expected } of cases) {
      expect(await v12Theme(text, config), name).toBe(expected);
      expect(await v13Fill(text, config), name).toBe(await v13Fill(SOURCE, { theme: expected }));
    }
    expect(await v13Fill(SOURCE)).toBe(hex(v12Vars('redux-color').venn1));
  });
});
