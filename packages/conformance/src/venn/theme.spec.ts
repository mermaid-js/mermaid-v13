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
 * light approximation (`base` and `forest`: `venn3` only; `neutral`: all eight slots), D333(a)'s
 * rounding in `default`'s `venn3`, and the title ink in `base`, `redux` and `redux-color`, where
 * v13's shared `titleColor` is not v12's.
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  THEME_NAMES,
  createTheme,
  formatColor,
  loadTheme,
  parseColor,
  type ThemeName,
} from '@mermaid-js/core/theme';
import { venn, vennPaints, type VennModel } from '@mermaid-js/diagram-venn';
import { loadOracle } from '../oracle.ts';

interface V12 {
  mermaidAPI: {
    reset(): void;
    initialize(config: object): void;
    getConfig(): { themeVariables: Record<string, unknown> };
  };
}

await loadOracle();
const v12 = ((await import('mermaid-v12')) as unknown as { default: V12 }).default;
/** khroma, as v12 resolves it (a dependency of `mermaid@12.2.0`, not of conformance). */
const khroma = createRequire(createRequire(import.meta.url).resolve('mermaid-v12'))('khroma') as {
  isDark(c: string): boolean;
  lighten(c: string, n: number): string;
  darken(c: string, n: number): string;
};

const SLOTS = 8;
/** Set indexes 0–9: the eight slots and two past them, where v12 starts again at `venn1`. */
const INDEXES = Array.from({ length: SLOTS + 2 }, (_, i) => i);

function v12Vars(theme: string, themeVariables?: object): Record<string, unknown> {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize(themeVariables ? { theme, themeVariables } : { theme });
  return { ...v12.mermaidAPI.getConfig().themeVariables };
}

const hex = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const rgba = parseColor(v);
  return rgba ? formatColor(rgba) : undefined;
};

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

/** A model of ten sets, A0…A9, nothing styled. */
const TEN: VennModel = {
  subsets: INDEXES.map((i) => ({ ast: `set:A${i}`, sets: [`A${i}`], size: 10 })),
  textNodes: [],
  styles: [],
  warnings: [],
};

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
  } as unknown as Parameters<typeof vennPaints>[1];
  const paints = vennPaints(TEN, ctx);
  const out: Record<string, string | undefined> = {
    vennTitleTextColor: hex(theme.value('vennTitleTextColor')),
    vennSetTextColor: hex(theme.value('vennSetTextColor')),
  };
  for (const i of INDEXES) {
    const c = paints.circle([`A${i}`], i % SLOTS);
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
const TITLE =
  'spec #429 “v13 entries”: the title ink is the rule titleColor, which v13 resolves by its shared contrast rule here, where v12 had its own (#000000, base’s derived near-black)';
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
  ...['base', 'redux', 'redux-color'].map((t): [string, string] => [
    `${t}/vennTitleTextColor`,
    TITLE,
  ]),
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

  // Listed (GAPS #495): v12 cycled whatever `venn*` it found, so in the four themes that define
  // none an author's lone `venn2` coloured every circle; v13 gives it slot 1 only.
  it.each(FLAT.map((n) => [n]))('%s: an author’s venn2 recolours slot 1 only', async (name) => {
    const author = { venn2: '#123456' };
    const old = v12Drawn(v12Vars(name, author));
    const now = await v13Drawn(name, author);
    expect([old.circle0, old.circle1]).toEqual(['#123456', '#123456']);
    expect([now.circle0, now.circle1]).toEqual([hex(v12Vars(name).primaryColor), '#123456']);
  });

  // v12 base derives every slot from the author's base colours; the label ink follows an
  // author's dark background.
  it('base: an author’s primaryColor, secondaryColor and background move the slots as in v12', async () => {
    const author = { primaryColor: '#aa3366', secondaryColor: '#3366aa', background: '#101010' };
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
});
