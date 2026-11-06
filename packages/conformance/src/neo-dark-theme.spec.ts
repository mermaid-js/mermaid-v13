/**
 * #227: v13's `neo-dark` against v12 12.2.0's resolved `getThemeVariables()` for
 * `theme: 'neo-dark'` (D151: v12 is the oracle). Every variable in the v13 vocabulary and every
 * palette is compared; each one that differs is in `DIFFERENCES` with the decision that makes
 * it, and the list has to match the differences found exactly, so none is unlisted and none is
 * stale. D183 cleans neo-dark up: dark derivation, stroke width 2 and AA.
 */
import {
  DARK_RULES,
  NUMBERED_PALETTES,
  PALETTE_LIMITS,
  PALETTE_VARIABLES,
  contrastRatio,
  formatColor,
  loadTheme,
  parseColor,
  type Rgba,
  type NumberedPalette,
  type Theme,
} from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { D332_INPUTS, VOCABULARY, everyTable } from './diagram-themes.ts';
import { loadOracle } from './oracle.ts';

interface V12 {
  mermaidAPI: {
    reset(): void;
    initialize(config: object): void;
    getConfig(): { themeVariables: Record<string, unknown> };
  };
}

await loadOracle();
const v12 = ((await import('mermaid-v12')) as unknown as { default: V12 }).default;

function v12Vars(theme: string): Record<string, unknown> {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize({ theme });
  return { ...v12.mermaidAPI.getConfig().themeVariables };
}

const OLD = v12Vars('neo-dark');
const spec = await loadTheme('neo-dark');
const neoDark = everyTable(spec, { cssVariables: false });
const neo = everyTable(await loadTheme('neo'), { cssVariables: false });

/** Owned by #223 (GAPS.md "Contracts"): compared like the rest once the vocabulary has them. */
const GRADIENT = ['useGradient', 'gradientStart', 'gradientStop'] as const;
const PENDING_GRADIENT = GRADIENT.filter((n) => !Object.hasOwn(VOCABULARY, n));

/** Geometry v12 takes from `look: neo`, not from a theme variable; v13 carries it as tokens. */
/**
 * Timeline's box variables (spec #291): v12 chose its timeline geometry and paint by a theme
 * name with `redux`, not by `look`, so `theme: neo` drew the classic values (D227).
 */
const TIMELINE = Object.keys(VOCABULARY).filter((n) => n.startsWith('timeline'));
/**
 * gitGraph's v13 variables (#374): v12 chose its gitGraph geometry by a theme name with `redux`
 * and its node colours by `NEO_COLOR_GEN_THEMES`, so `theme: neo` drew classic geometry with the
 * node colours (D266). `commitLineColor` is v12's, which no neo theme sets (`?? lineColor`).
 */
const GITGRAPH = [...Object.keys(VOCABULARY).filter((n) => n.startsWith('git')), 'commitLineColor'];

const LOOK_GEOMETRY = Object.entries(VOCABULARY)
  .filter(([name, d]) => (d.kind === 'length' || d.kind === 'padding') && !(name in OLD))
  .filter(([name]) => !TIMELINE.includes(name) && !GITGRAPH.includes(name))
  .map(([name]) => name);

const LOOK_GEOMETRY_WHY =
  'D181, D152: v12 neo geometry comes from `look: neo`; v13 carries the redux family values';

/** v12 derived these with the light rules because it never set `darkMode` (D183). */
const DARK_DERIVED = [
  'secondaryBorderColor',
  'tertiaryBorderColor',
  'clusterBorder',
  'noteBorderColor',
  'edgeLabelBackground',
] as const;

const DARK_WHY = 'D183: derived with the dark rules; v12 never set darkMode';

/** Each difference from v12 neo-dark, with the decision that makes it. */
const DIFFERENCES: Readonly<Record<string, string>> = {
  ...Object.fromEntries(DARK_DERIVED.map((n) => [n, DARK_WHY])),
  strokeWidth: 'D183: 2, as in neo; v12 neo-dark drew with 1',
  quadrantPointFill:
    'D231: v12 resolved it to hsl(…, NaN%); v13 defaults to textColor, as v12 points showed',
  secondaryTextColor: 'D183, R-THEME-9: v12 #b8b6b6 is 4.49:1 on secondaryColor; #b9b7b7 meets AA',
  altBackground: 'D189: #404040; v12 #f0f0f0 hid the #cccccc lines on a nested composite',
  dropShadow: 'D181: the same blurred shadow, written in the syntax `checkFilter` accepts',
  // Journey (#327): v12 sets neither; `.face` falls back to #FFF8DC and dots to actorColours.
  faceColor: 'D245: v12 sets no faceColor; v13 gives its `.face` fallback #FFF8DC as the value',
  ...Object.fromEntries(
    [0, 1, 2, 3, 4, 5].map((i) => [`actor${i}`, 'D249: author-only; no theme sets actor<n>'])
  ),
  tagBorder: "D267: author-only, v12's other name for tagLabelBorder; no theme sets it",
  // v13 variables for what v12 decides by look or by theme name.
  rowOdd: 'D152: v12 neo-look ER rows show the entity fill (mainBkg)',
  rowEven: 'D152: v12 neo-look ER rows show the entity fill (mainBkg)',
  erMarkerFill: 'D152: v12 `zero_or_one_neo` fills the zero circle with the node fill',
  erEdgeLabelBackground:
    'D152, D183: v12 ER labels use edgeLabelBackground outside its COLOR_THEMES; it is dark-derived',
  ...Object.fromEntries(LOOK_GEOMETRY.map((n) => [n, LOOK_GEOMETRY_WHY])),
  ...Object.fromEntries(
    TIMELINE.map((n) => [n, 'D227: v12 has no variable; theme neo drew classic timeline boxes'])
  ),
  ...Object.fromEntries(
    GITGRAPH.map((n) => [n, 'D266: v12 has no value; theme neo drew classic gitGraph geometry'])
  ),
};

const hex = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const rgba = parseColor(v);
  return rgba ? formatColor(rgba) : undefined;
};

function v13Value(t: Theme, name: string): string | number {
  const kind = VOCABULARY[name]?.kind;
  if (kind === 'padding') return t.padding(name, 15);
  if (kind === 'length') return t.number(name);
  return t.value(name);
}

function same(name: string): boolean {
  const old = OLD[name];
  if (typeof old !== 'string' && typeof old !== 'number' && typeof old !== 'boolean') return false;
  const now = v13Value(neoDark, name);
  const kind = VOCABULARY[name]?.kind;
  if (kind === 'color') return hex(old) !== undefined && hex(old) === hex(now);
  if (kind === 'length') return Number.parseFloat(String(old)) === now;
  return String(old).trim() === String(now).trim();
}

function v12Palette(name: string): string[] {
  if (NUMBERED_PALETTES.includes(name as never))
    return Array.from(
      { length: PALETTE_LIMITS[name as NumberedPalette] },
      (_, i) => OLD[`${name}${i}`] as string
    );
  const list = OLD[name];
  return Array.isArray(list) ? (list as string[]) : [];
}

describe('neo-dark against v12 12.2.0 (#227, D151, D181, D183)', () => {
  it('loads v12 neo-dark, which never set darkMode', () => {
    expect(OLD.fontFamily).toBe('arial, sans-serif');
    expect(OLD.radius).toBe(3);
    expect(OLD.strokeWidth).toBe(1);
    expect(OLD.darkMode).toBeFalsy();
  });

  it('differs from v12 only where a decision says so', () => {
    const vocabulary = Object.keys(VOCABULARY).filter((n) => !D332_INPUTS.includes(n) && !same(n));
    const palettes = PALETTE_VARIABLES.filter((p) => !D332_INPUTS.includes(p)).filter(
      (p) => JSON.stringify(v12Palette(p).map(hex)) !== JSON.stringify(neoDark.palette(p).map(hex))
    );
    expect([...vocabulary, ...palettes].sort()).toEqual(Object.keys(DIFFERENCES).sort());
  });

  it('is a dark theme whose differing colours come from the shared dark rules (D183)', () => {
    expect(spec.dark).toBe(true);
    for (const name of DARK_DERIVED) {
      expect(Object.hasOwn(spec.values ?? {}, name), name).toBe(false);
      expect(Object.hasOwn(spec.rules ?? {}, name), name).toBe(false);
    }
    expect(DARK_RULES.edgeLabelBackground).toBe('mix(secondaryColor, black, 30%)');
    expect(neoDark.value('clusterBorder')).toBe(neoDark.value('tertiaryBorderColor'));
    expect(neoDark.value('erEdgeLabelBackground')).toBe(neoDark.value('edgeLabelBackground'));
  });

  it('meets AA with the smallest change to v12 secondaryTextColor (D183, R-THEME-9)', () => {
    const on = neoDark.rgba('secondaryColor') as Rgba;
    expect(contrastRatio(parseColor(String(OLD.secondaryTextColor))!, on)).toBeLessThan(4.5);
    expect(contrastRatio(neoDark.rgba('secondaryTextColor') as Rgba, on)).toBeGreaterThanOrEqual(
      4.5
    );
  });

  it('keeps transitions visible on a nested composite body (D189)', () => {
    expect(hex(OLD.altBackground)).toBe('#f0f0f0');
    expect(hex(neoDark.value('altBackground'))).toBe('#404040');
    const lines = neoDark.rgba('lineColor') as Rgba;
    expect(contrastRatio(lines, parseColor(String(OLD.altBackground))!)).toBeLessThan(3);
    expect(contrastRatio(lines, neoDark.rgba('altBackground') as Rgba)).toBeGreaterThanOrEqual(3);
  });

  it('takes the neo tokens: stroke width 2, radius 3 (D181, D183)', () => {
    expect(neoDark.number('strokeWidth')).toBe(2);
    expect(neoDark.number('radius')).toBe(3);
    for (const name of LOOK_GEOMETRY)
      expect(v13Value(neoDark, name), name).toEqual(v13Value(neo, name));
  });

  it('draws the same shadow as v12 (D181)', () => {
    const shadow = /^drop-shadow\(\s*(\S+)\s+(\S+)\s+(\S+)\s+(.+?)\);?$/;
    const [, ...a] = shadow.exec(String(OLD.dropShadow).trim()) ?? [];
    const [, ...b] = shadow.exec(neoDark.filter('dropShadow')) ?? [];
    expect(b.slice(0, 3).map((x) => Number.parseFloat(x))).toEqual(
      a.slice(0, 3).map((x) => Number.parseFloat(x))
    );
    expect(parseColor(b[3]!)).toEqual(parseColor(a[3]!.replace(/\s+/g, '')));
  });

  it('gives the ER rows and marker what v12 neo draws (D152)', () => {
    expect(hex(neoDark.value('rowOdd'))).toBe(hex(OLD.mainBkg));
    expect(hex(neoDark.value('rowEven'))).toBe(hex(OLD.mainBkg));
    expect(hex(neoDark.value('erMarkerFill'))).toBe(hex(OLD.mainBkg));
  });

  it("has no per-subgraph palette (D181); its cScale palettes are v12 neo-dark's (D258)", () => {
    expect(neoDark.palette('borderColorArray')).toEqual([]);
    expect(neoDark.palette('bkgColorArray')).toEqual([]);
    for (const p of NUMBERED_PALETTES)
      expect(neoDark.palette(p), p).toHaveLength(PALETTE_LIMITS[p]);
  });

  // GAPS.md "Contracts": #223 owns the gradient vocabulary. Until it merges these are not v13
  // variables, so neo-dark cannot set them; afterwards the comparison above covers them.
  it.skipIf(PENDING_GRADIENT.length === 0)(
    'gradient variables, added once #223 merges: v12 neo-dark values',
    () => {
      expect(PENDING_GRADIENT).toEqual([...GRADIENT]);
      expect(GRADIENT.map((n) => OLD[n])).toEqual([true, '#0042eb', '#eb0042']);
    }
  );
});
