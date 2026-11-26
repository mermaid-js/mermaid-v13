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
  loadTheme,
  parseColor,
  type Rgba,
} from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { D332_INPUTS, VOCABULARY, everyTable } from './diagram-themes.ts';
import { v12Vars } from './v12-theme.ts';
import { hex } from './hex.ts';
import { sameAsV12, v12Palette, v13Value } from './neo-compare.ts';

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
] as const;

const DARK_WHY = 'D183: derived with the dark rules; v12 never set darkMode';

/** Each difference from v12 neo-dark, with the decision that makes it. */
const DIFFERENCES: Readonly<Record<string, string>> = {
  xyChartDataLabelColor:
    'D333(b): v12 neo-dark sets no xyChart.dataLabelColor (its DB drew theme-default’s); v13 takes primaryTextColor',
  ...Object.fromEntries(DARK_DERIVED.map((n) => [n, DARK_WHY])),
  strokeWidth: 'D183: 2, as in neo; v12 neo-dark drew with 1',
  quadrantPointFill:
    'D231: v12 resolved it to hsl(…, NaN%); v13 defaults to textColor, as v12 points showed',
  secondaryTextColor: 'D183, R-THEME-9: v12 #b8b6b6 is 4.49:1 on secondaryColor; #b9b7b7 meets AA',
  altBackground: 'D189: #404040; v12 #f0f0f0 hid the #cccccc lines on a nested composite',
  pie5: "D333(a): darkenHsl(secondaryColor, 10%) of the hex colour; v12's #2e3030 is a rounding artefact",
  dropShadow: 'D181: the same blurred shadow, written in the syntax `checkFilter` accepts',
  // Journey (#327): v12 sets neither; `.face` falls back to #FFF8DC and dots to actorColours.
  faceColor: 'D245: v12 sets no faceColor; v13 gives its `.face` fallback #FFF8DC as the value',
  ...Object.fromEntries(
    [0, 1, 2, 3, 4, 5].map((i) => [`actor${i}`, 'D249: author-only; no theme sets actor<n>'])
  ),
  tagBorder: "D267: author-only, v12's other name for tagLabelBorder; no theme sets it",
  // Requirement (#574): v12 declared these but drew mainBkg, strokeWidth and edgeLabelBackground.
  requirementBackground: 'D435, D541: v12 resolved primaryColor; it drew the box in mainBkg',
  requirementBorderSize:
    "D435, D541, D183: v12 resolved '1' and drew strokeWidth (1 in v12 neo-dark); v13 strokeWidth is 2",
  relationLabelBackground: 'D628: every edge label is filled with the theme background',
  relationLabelColor:
    'D713: textColor (#cccccc) where it reads on the tag; v12 drew nodeTextColor (#e0dfdf)',
  requirementEdgeLabelBackground: 'D715: v12 has no variable; the tag fill, D628',
  requirementEdgeLabelColor: 'D715: v12 has no variable; the tag ink, D713',
  edgeLabelBackground: 'D628: every edge label is filled with the theme background',
  classEdgeLabelBackground: 'D628, D715: v13 class tag fill; edgeLabelBackground here',
  classEdgeLabelColor: 'D713: v13 ink for the class tag; textColor here, where it reads',
  flowchartEdgeLabelBackground: 'D715: v12 has no variable; the tag fill, D628',
  flowchartEdgeLabelColor: 'D715: v12 has no variable; the tag ink, D713',
  stateEdgeLabelBackground: 'D715: v12 has no variable; the tag fill, D628',
  stateEdgeLabelColor: 'D715: v12 has no variable; the tag ink, D713',
  erEdgeLabelColor: 'D715: v12 has no variable; the tag ink, D713',
  // v13 variables for what v12 decides by look or by theme name.
  rowOdd: 'D152: v12 neo-look ER rows show the entity fill (mainBkg)',
  rowEven: 'D152: v12 neo-look ER rows show the entity fill (mainBkg)',
  erMarkerFill: 'D152: v12 `zero_or_one_neo` fills the zero circle with the node fill',
  ...Object.fromEntries(
    ['erRowOddTextColor', 'erRowEvenTextColor'].map((n) => [
      n,
      '#799 (spec #795): v13 ink for ER attribute text on its own row; neo rows show the entity fill, so the renderer keeps nodeTextColor',
    ])
  ),
  critTextColor:
    'D574: v13 ink for text on a critical gantt bar (v12 `.critText0` took taskTextColor); taskTextColor here',
  compositeTitleColor:
    'D638: v12 has no variable; it drew composite titles in stateLabelColor; v13 neo takes titleColor',
  erEdgeLabelBackground: 'D628: every edge label is filled with the theme background',
  ...Object.fromEntries(LOOK_GEOMETRY.map((n) => [n, LOOK_GEOMETRY_WHY])),
  ...Object.fromEntries(
    TIMELINE.map((n) => [n, 'D227: v12 has no variable; theme neo drew classic timeline boxes'])
  ),
  ...Object.fromEntries(
    Object.keys(VOCABULARY)
      .filter((n) => n.startsWith('mindmap'))
      .map((n) => [n, 'D288, D152: v12 has no variable; it chose mindmap paint by look and theme'])
  ),
  ...Object.fromEntries(
    GITGRAPH.map((n) => [n, 'D266: v12 has no value; theme neo drew classic gitGraph geometry'])
  ),
};

describe('neo-dark against v12 12.2.0 (#227, D151, D181, D183)', () => {
  it('loads v12 neo-dark, which never set darkMode', () => {
    expect(OLD.fontFamily).toBe('arial, sans-serif');
    expect(OLD.radius).toBe(3);
    expect(OLD.strokeWidth).toBe(1);
    expect(OLD.darkMode).toBeFalsy();
  });

  it('differs from v12 only where a decision says so', () => {
    const vocabulary = Object.keys(VOCABULARY).filter(
      (n) => !D332_INPUTS.includes(n) && !sameAsV12(OLD, neoDark, n)
    );
    const palettes = PALETTE_VARIABLES.filter((p) => !D332_INPUTS.includes(p)).filter(
      (p) =>
        JSON.stringify(v12Palette(OLD, p).map(hex)) !== JSON.stringify(neoDark.palette(p).map(hex))
    );
    expect([...vocabulary, ...palettes].sort()).toEqual(Object.keys(DIFFERENCES).sort());
  });

  it('is a dark theme whose differing colours come from the shared dark rules (D183)', () => {
    expect(spec.dark).toBe(true);
    for (const name of DARK_DERIVED) {
      expect(Object.hasOwn(spec.values ?? {}, name), name).toBe(false);
      expect(Object.hasOwn(spec.rules ?? {}, name), name).toBe(false);
    }
    expect(DARK_RULES.secondaryBorderColor).toBe('mix(secondaryColor, white, 20%)');
    expect(neoDark.value('clusterBorder')).toBe(neoDark.value('tertiaryBorderColor'));
    // Edge labels sit on the background in every theme (D628).
    expect(neoDark.value('edgeLabelBackground')).toBe(neoDark.value('background'));
    expect(neoDark.value('erEdgeLabelBackground')).toBe(neoDark.value('background'));
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
