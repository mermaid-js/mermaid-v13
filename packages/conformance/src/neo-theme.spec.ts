/**
 * #225: v13's `neo` against v12 12.2.0's resolved `getThemeVariables()` for `theme: 'neo'`
 * (D151: v12 is the oracle). Every variable in the v13 vocabulary and every palette is
 * compared; each one that differs is in `DIFFERENCES` with the decision that makes it, and the
 * list has to match the differences found exactly, so none is unlisted and none is stale.
 */
import {
  NUMBERED_PALETTES,
  PALETTE_VARIABLES,
  PALETTE_LIMIT,
  THEME_VARIABLES,
  formatColor,
  loadTheme,
  parseColor,
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

const OLD = v12Vars('neo');
const neo = everyTable(await loadTheme('neo'), { cssVariables: false });
const redux = everyTable(await loadTheme('redux'), { cssVariables: false });

/** Owned by #223 (GAPS.md "Contracts"): compared like the rest once the vocabulary has them. */
const GRADIENT = ['useGradient', 'gradientStart', 'gradientStop'] as const;
const PENDING_GRADIENT = GRADIENT.filter((n) => !Object.hasOwn(VOCABULARY, n));

/** Geometry v12 takes from `look: neo`, not from a theme variable; v13 carries it as tokens. */
/**
 * Timeline's box variables (spec #291): v12 chose its timeline geometry and paint by a theme
 * name with `redux`, not by `look`, so `theme: neo` drew the classic values (D227).
 */
const TIMELINE = Object.keys(VOCABULARY).filter((n) => n.startsWith('timeline'));

const LOOK_GEOMETRY = Object.entries(VOCABULARY)
  .filter(([name, d]) => (d.kind === 'length' || d.kind === 'padding') && !(name in OLD))
  .filter(([name]) => !TIMELINE.includes(name))
  .map(([name]) => name);

const LOOK_GEOMETRY_WHY =
  'D181, D152: v12 neo geometry comes from `look: neo`; v13 carries the redux family values';

/** Each difference from v12 neo, with the decision that makes it. */
const DIFFERENCES: Readonly<Record<string, string>> = {
  dropShadow: 'D181: the same blurred shadow, written in the syntax `checkFilter` accepts',
  // Journey (#327): v12 sets neither; `.face` falls back to #FFF8DC and dots to actorColours.
  faceColor: 'D245: v12 sets no faceColor; v13 gives its `.face` fallback #FFF8DC as the value',
  ...Object.fromEntries(
    [0, 1, 2, 3, 4, 5].map((i) => [`actor${i}`, 'D249: author-only; no theme sets actor<n>'])
  ),
  // v13 variables for what v12 decides by look or by theme name.
  rowOdd: 'D152: v12 neo-look ER rows show the entity fill (mainBkg)',
  rowEven: 'D152: v12 neo-look ER rows show the entity fill (mainBkg)',
  erMarkerFill: 'D152: v12 `zero_or_one_neo` fills the zero circle with the node fill',
  erEdgeLabelBackground:
    'D152: v12 ER labels use edgeLabelBackground outside its COLOR_THEMES (redux-color, redux-dark-color)',
  border1: 'D152: v12 neo leaves it unset; no ported diagram reads it (usedBy is empty)',
  quadrantPointFill:
    'D231: v12 resolved it to hsl(…, NaN%); v13 defaults to textColor, as v12 points showed',
  ...Object.fromEntries(LOOK_GEOMETRY.map((n) => [n, LOOK_GEOMETRY_WHY])),
  ...Object.fromEntries(
    TIMELINE.map((n) => [n, 'D227: v12 has no variable; theme neo drew classic timeline boxes'])
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
  const now = v13Value(neo, name);
  const kind = VOCABULARY[name]?.kind;
  if (kind === 'color') return hex(old) !== undefined && hex(old) === hex(now);
  if (kind === 'length') return Number.parseFloat(String(old)) === now;
  return String(old).trim() === String(now).trim();
}

function v12Palette(name: string): string[] {
  if (NUMBERED_PALETTES.includes(name as never))
    return Array.from({ length: PALETTE_LIMIT }, (_, i) => OLD[`${name}${i}`] as string);
  const list = OLD[name];
  return Array.isArray(list) ? (list as string[]) : [];
}

describe('neo against v12 12.2.0 (#225, D151, D181)', () => {
  it('loads v12 neo', () => {
    expect(OLD.fontFamily).toBe('arial, sans-serif');
    expect(OLD.radius).toBe(3);
  });

  it('differs from v12 only where a decision says so', () => {
    const vocabulary = Object.keys(VOCABULARY).filter((n) => !D332_INPUTS.includes(n) && !same(n));
    const palettes = PALETTE_VARIABLES.filter((p) => !D332_INPUTS.includes(p)).filter(
      (p) => JSON.stringify(v12Palette(p).map(hex)) !== JSON.stringify(neo.palette(p).map(hex))
    );
    expect([...vocabulary, ...palettes].sort()).toEqual(Object.keys(DIFFERENCES).sort());
  });

  it('draws the same shadow as v12 (D181)', () => {
    const shadow = /^drop-shadow\(\s*(\S+)\s+(\S+)\s+(\S+)\s+(.+?)\);?$/;
    const [, ...a] = shadow.exec(String(OLD.dropShadow).trim()) ?? [];
    const [, ...b] = shadow.exec(neo.filter('dropShadow')) ?? [];
    expect(b.slice(0, 3).map((x) => Number.parseFloat(x))).toEqual(
      a.slice(0, 3).map((x) => Number.parseFloat(x))
    );
    expect(parseColor(b[3]!)).toEqual(parseColor(a[3]!));
  });

  it('takes the redux family look-neo geometry (D181)', () => {
    expect(LOOK_GEOMETRY.length).toBeGreaterThan(0);
    for (const name of LOOK_GEOMETRY)
      expect(v13Value(neo, name), name).toEqual(v13Value(redux, name));
  });

  it('takes the classic timeline values, as v12 theme neo drew (D227)', async () => {
    const classic = everyTable(await loadTheme('default'), { cssVariables: false });
    expect(TIMELINE.length).toBe(4);
    for (const name of TIMELINE) expect(v13Value(neo, name), name).toEqual(v13Value(classic, name));
  });

  it('gives the ER variables what v12 neo draws (D152)', () => {
    expect(hex(neo.value('rowOdd'))).toBe(hex(OLD.mainBkg));
    expect(hex(neo.value('rowEven'))).toBe(hex(OLD.mainBkg));
    expect(hex(neo.value('erMarkerFill'))).toBe(hex(OLD.mainBkg));
    expect(hex(neo.value('erEdgeLabelBackground'))).toBe(hex(OLD.edgeLabelBackground));
  });

  it('lists border1 only because nothing reads it', () => {
    expect(OLD.border1).toBeUndefined();
    expect(THEME_VARIABLES.border1?.usedBy).toEqual([]);
  });

  it("has no per-subgraph palette (D181); its cScale palettes are v12 neo's (D258)", () => {
    expect(neo.palette('borderColorArray')).toEqual([]);
    expect(neo.palette('bkgColorArray')).toEqual([]);
    for (const p of NUMBERED_PALETTES) expect(neo.palette(p), p).toHaveLength(PALETTE_LIMIT);
  });

  // GAPS.md "Contracts": #223 owns the gradient vocabulary. Until it merges these are not v13
  // variables, so neo cannot set them; afterwards the comparison above covers them.
  it.skipIf(PENDING_GRADIENT.length === 0)(
    'gradient variables, added once #223 merges: v12 neo values',
    () => {
      expect(PENDING_GRADIENT).toEqual([...GRADIENT]);
      expect(GRADIENT.map((n) => OLD[n])).toEqual([true, '#0042eb', '#eb0042']);
    }
  );
});
