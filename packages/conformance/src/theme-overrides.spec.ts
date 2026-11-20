/**
 * #796 (spec #795 T0, D568): core's shared colour variables in the five classic themes against v12
 * 12.2.0 (D151: v12 is the oracle), at the theme values and under one `themeVariables` override
 * at a time: each base colour and `mainBkg` set alone to a light and to a dark test colour, and
 * `darkMode` (`override-matrix.ts`). Every colour variable of core's vocabulary that v12 also
 * resolves is compared, as a value under every override. v12's values are the literals of `V12`
 * (D654), printed by the capture tool (`override-matrix.ts` says how to run it), so the spec
 * runs without v12. Each difference is listed in `DIFFERENCES` as `theme / override / variable`,
 * under the decision that accounts for it (a D-id with a MIGRATION.md row), and the list has to
 * match the differences found exactly: an unlisted difference fails, and so does a listed one
 * that has gone. A ticket that fixes a difference deletes its entries.
 */
import { THEME_VARIABLES } from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { D332_INPUTS } from './diagram-themes.ts';
import {
  ALL,
  THEMES,
  describeSharedOverrides,
  keys,
  type Classic,
  type ReferenceTable,
} from './override-matrix.ts';

/** v12 12.2.0's shared colours: `capture-theme-overrides.ts shared`. */
const V12: ReferenceTable = {
  default: {
    primaryColor: {
      none: '#ececff',
      'primaryColor:light': '#ffd966',
      'primaryColor:dark': '#2a4d69',
    },
    secondaryColor: {
      none: '#ffffde',
      'secondaryColor:light': '#ffd966',
      'secondaryColor:dark': '#2a4d69',
    },
    tertiaryColor: {
      none: '#f9ffec',
      'tertiaryColor:light': '#ffd966',
      'tertiaryColor:dark': '#2a4d69',
    },
    background: { none: '#ffffff', 'background:light': '#ffd966', 'background:dark': '#2a4d69' },
    primaryTextColor: {
      none: '#131300',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    lineColor: { none: '#333333', 'lineColor:light': '#ffd966', 'lineColor:dark': '#2a4d69' },
    primaryBorderColor: '#c7c7f1',
    secondaryBorderColor: '#eeeebc',
    tertiaryBorderColor: '#e3f1c7',
    secondaryTextColor: '#000021',
    tertiaryTextColor: '#060013',
    textColor: '#333333',
    mainBkg: { none: '#ececff', 'mainBkg:light': '#ffd966', 'mainBkg:dark': '#2a4d69' },
    nodeBorder: '#9370db',
    clusterBkg: '#ffffde',
    clusterBorder: '#aaaa33',
    titleColor: '#333333',
    edgeLabelBackground: '#e8e8e8cc',
    arrowheadColor: '#333333',
    defaultLinkColor: {
      none: '#333333',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    border1: '#9370db',
    border2: '#aaaa33',
    noteBkgColor: '#fff5ad',
    noteTextColor: '#000000',
    noteBorderColor: '#aaaa33',
    errorBkgColor: '#552222',
    errorTextColor: '#552222',
    scaleLabelColor: '#000000',
    actorBkg: { none: '#ececff', 'mainBkg:light': '#ffd966', 'mainBkg:dark': '#2a4d69' },
    actorBorder: '#9370db',
    gradientStart: '#c7c7f1',
    gradientStop: '#eeeebc',
  },
  dark: {
    primaryColor: {
      none: '#1f2020',
      'primaryColor:light': '#ffd966',
      'primaryColor:dark': '#2a4d69',
    },
    secondaryColor: {
      none: '#474949',
      'secondaryColor:light': '#ffd966',
      'secondaryColor:dark': '#2a4d69',
    },
    tertiaryColor: {
      none: '#201f1f',
      'tertiaryColor:light': '#ffd966',
      'tertiaryColor:dark': '#2a4d69',
    },
    background: { none: '#333333', 'background:light': '#ffd966', 'background:dark': '#2a4d69' },
    primaryTextColor: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    lineColor: { none: '#d3d3d3', 'lineColor:light': '#ffd966', 'lineColor:dark': '#2a4d69' },
    primaryBorderColor: '#cccccc',
    secondaryBorderColor: '#2f2f2f',
    tertiaryBorderColor: '#060606',
    secondaryTextColor: '#b8b6b6',
    tertiaryTextColor: '#dfe0e0',
    textColor: '#cccccc',
    mainBkg: { none: '#1f2020', 'mainBkg:light': '#ffd966', 'mainBkg:dark': '#2a4d69' },
    nodeBorder: '#cccccc',
    clusterBkg: { none: '#474949', 'mainBkg:light': '#ffedb8', 'mainBkg:dark': '#4178a3' },
    clusterBorder: '#ffffff40',
    titleColor: '#f9fffe',
    edgeLabelBackground: '#585858',
    arrowheadColor: '#d3d3d3',
    defaultLinkColor: '#d3d3d3',
    border1: '#cccccc',
    border2: '#ffffff40',
    noteBkgColor: { none: '#474949', 'mainBkg:light': '#ffedb8', 'mainBkg:dark': '#4178a3' },
    noteTextColor: '#b8b6b6',
    noteBorderColor: '#2f2f2f',
    errorBkgColor: '#a44141',
    errorTextColor: '#dddddd',
    scaleLabelColor: { none: '#d3d3d3', darkMode: '#000000' },
    actorBkg: { none: '#1f2020', 'mainBkg:light': '#ffd966', 'mainBkg:dark': '#2a4d69' },
    actorBorder: '#cccccc',
    gradientStart: '#cccccc',
    gradientStop: '#2f2f2f',
  },
  forest: {
    primaryColor: {
      none: '#cde498',
      'primaryColor:light': '#ffd966',
      'primaryColor:dark': '#2a4d69',
    },
    secondaryColor: {
      none: '#cdffb2',
      'secondaryColor:light': '#ffd966',
      'secondaryColor:dark': '#2a4d69',
    },
    tertiaryColor: {
      none: '#e1efc0',
      'tertiaryColor:light': '#ffd966',
      'tertiaryColor:dark': '#2a4d69',
    },
    background: { none: '#ffffff', 'background:light': '#ffd966', 'background:dark': '#2a4d69' },
    primaryTextColor: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    lineColor: { none: '#000000', 'lineColor:light': '#ffd966', 'lineColor:dark': '#2a4d69' },
    primaryBorderColor: '#abb594',
    secondaryBorderColor: '#b4e599',
    tertiaryBorderColor: '#c3cab2',
    secondaryTextColor: '#32004d',
    tertiaryTextColor: '#321b67',
    textColor: '#000000',
    mainBkg: { none: '#cde498', 'mainBkg:light': '#ffd966', 'mainBkg:dark': '#2a4d69' },
    nodeBorder: '#13540c',
    clusterBkg: '#cdffb2',
    clusterBorder: '#6eaa49',
    titleColor: '#333333',
    edgeLabelBackground: '#e8e8e8',
    arrowheadColor: '#008000',
    defaultLinkColor: {
      none: '#000000',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    border1: '#13540c',
    border2: '#6eaa49',
    noteBkgColor: '#fff5ad',
    noteTextColor: '#000000',
    noteBorderColor: '#6eaa49',
    errorBkgColor: '#552222',
    errorTextColor: '#552222',
    scaleLabelColor: '#000000',
    actorBkg: { none: '#cde498', 'mainBkg:light': '#ffd966', 'mainBkg:dark': '#2a4d69' },
    actorBorder: { none: '#a6cf47', 'mainBkg:light': '#ffc000', 'mainBkg:dark': '#0d1820' },
    gradientStart: '#abb594',
    gradientStop: '#b4e599',
  },
  neutral: {
    primaryColor: {
      none: '#eeeeee',
      'primaryColor:light': '#ffd966',
      'primaryColor:dark': '#2a4d69',
    },
    secondaryColor: {
      none: '#fcfcfc',
      'secondaryColor:light': '#ffd966',
      'secondaryColor:dark': '#2a4d69',
    },
    tertiaryColor: {
      none: '#eeeeee',
      'tertiaryColor:light': '#ffd966',
      'tertiaryColor:dark': '#2a4d69',
    },
    background: { none: '#ffffff', 'background:light': '#ffd966', 'background:dark': '#2a4d69' },
    primaryTextColor: {
      none: '#111111',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    lineColor: { none: '#666666', 'lineColor:light': '#ffd966', 'lineColor:dark': '#2a4d69' },
    primaryBorderColor: '#d4d4d4',
    secondaryBorderColor: '#e3e3e3',
    tertiaryBorderColor: '#d4d4d4',
    secondaryTextColor: '#030303',
    tertiaryTextColor: '#111111',
    textColor: '#000000',
    mainBkg: { none: '#eeeeee', 'mainBkg:light': '#ffd966', 'mainBkg:dark': '#2a4d69' },
    nodeBorder: '#999999',
    clusterBkg: '#fcfcfc',
    clusterBorder: '#707070',
    titleColor: '#333333',
    edgeLabelBackground: '#ffffff',
    arrowheadColor: '#333333',
    defaultLinkColor: {
      none: '#666666',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    border1: '#999999',
    border2: '#707070',
    noteBkgColor: '#666666',
    noteTextColor: '#ffffff',
    noteBorderColor: '#999999',
    errorBkgColor: '#552222',
    errorTextColor: '#552222',
    scaleLabelColor: { none: '#333333', darkMode: '#000000' },
    actorBkg: { none: '#eeeeee', 'mainBkg:light': '#ffd966', 'mainBkg:dark': '#2a4d69' },
    actorBorder: '#d4d4d4',
    gradientStart: '#d4d4d4',
    gradientStop: '#e3e3e3',
  },
  base: {
    primaryColor: {
      none: '#fff4dd',
      'primaryColor:light': '#ffd966',
      'primaryColor:dark': '#2a4d69',
    },
    secondaryColor: {
      none: '#f4ddff',
      'primaryColor:light': '#d966ff',
      'primaryColor:dark': '#4d692a',
      'secondaryColor:light': '#ffd966',
      'secondaryColor:dark': '#2a4d69',
    },
    tertiaryColor: {
      none: '#f6f9ff',
      'primaryColor:light': '#809fff',
      'primaryColor:dark': '#7b5231',
      'tertiaryColor:light': '#ffd966',
      'tertiaryColor:dark': '#2a4d69',
    },
    background: { none: '#f4f4f4', 'background:light': '#ffd966', 'background:dark': '#2a4d69' },
    primaryTextColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    lineColor: {
      none: '#0b0b0b',
      'background:light': '#002699',
      'background:dark': '#d5b296',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    primaryBorderColor: {
      none: '#eeddbb',
      'primaryColor:light': '#d6b85c',
      'primaryColor:dark': '#2f3031',
      darkMode: '#ffffff',
    },
    secondaryBorderColor: {
      none: '#ddbbee',
      'primaryColor:light': '#b85cd6',
      'primaryColor:dark': '#30312f',
      'secondaryColor:light': '#d6b85c',
      'secondaryColor:dark': '#2f3031',
      darkMode: '#ffffff',
    },
    tertiaryBorderColor: {
      none: '#cfdbf3',
      'primaryColor:light': '#708bdb',
      'primaryColor:dark': '#3e3d3b',
      'tertiaryColor:light': '#d6b85c',
      'tertiaryColor:dark': '#2f3031',
      darkMode: '#ffffff',
    },
    secondaryTextColor: {
      none: '#0b2200',
      'primaryColor:light': '#269900',
      'primaryColor:dark': '#b296d5',
      'secondaryColor:light': '#002699',
      'secondaryColor:dark': '#d5b296',
    },
    tertiaryTextColor: {
      none: '#090600',
      'primaryColor:light': '#806000',
      'primaryColor:dark': '#84adce',
      'tertiaryColor:light': '#002699',
      'tertiaryColor:dark': '#d5b296',
    },
    textColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    mainBkg: {
      none: '#fff4dd',
      'primaryColor:light': '#ffd966',
      'primaryColor:dark': '#2a4d69',
      'mainBkg:light': '#ffd966',
      'mainBkg:dark': '#2a4d69',
    },
    nodeBorder: {
      none: '#eeddbb',
      'primaryColor:light': '#d6b85c',
      'primaryColor:dark': '#2f3031',
      darkMode: '#ffffff',
    },
    nodeTextColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    clusterBkg: {
      none: '#f6f9ff',
      'primaryColor:light': '#809fff',
      'primaryColor:dark': '#7b5231',
      'tertiaryColor:light': '#ffd966',
      'tertiaryColor:dark': '#2a4d69',
    },
    clusterBorder: {
      none: '#cfdbf3',
      'primaryColor:light': '#708bdb',
      'primaryColor:dark': '#3e3d3b',
      'tertiaryColor:light': '#d6b85c',
      'tertiaryColor:dark': '#2f3031',
      darkMode: '#ffffff',
    },
    titleColor: {
      none: '#090600',
      'primaryColor:light': '#806000',
      'primaryColor:dark': '#84adce',
      'tertiaryColor:light': '#002699',
      'tertiaryColor:dark': '#d5b296',
    },
    edgeLabelBackground: {
      none: '#f4ddff',
      'primaryColor:light': '#d966ff',
      'primaryColor:dark': '#4d692a',
      'secondaryColor:light': '#ffd966',
      'secondaryColor:dark': '#2a4d69',
      darkMode: '#c244ff',
    },
    arrowheadColor: {
      none: '#0b0b0b',
      'background:light': '#002699',
      'background:dark': '#d5b296',
    },
    defaultLinkColor: {
      none: '#0b0b0b',
      'background:light': '#002699',
      'background:dark': '#d5b296',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    border2: {
      none: '#cfdbf3',
      'primaryColor:light': '#708bdb',
      'primaryColor:dark': '#3e3d3b',
      'tertiaryColor:light': '#d6b85c',
      'tertiaryColor:dark': '#2f3031',
      darkMode: '#ffffff',
    },
    noteBkgColor: '#fff5ad',
    noteTextColor: '#333333',
    noteBorderColor: { none: '#e4db95', darkMode: '#f9f7e6' },
    errorBkgColor: {
      none: '#f6f9ff',
      'primaryColor:light': '#809fff',
      'primaryColor:dark': '#7b5231',
      'tertiaryColor:light': '#ffd966',
      'tertiaryColor:dark': '#2a4d69',
    },
    errorTextColor: {
      none: '#090600',
      'primaryColor:light': '#806000',
      'primaryColor:dark': '#84adce',
      'tertiaryColor:light': '#002699',
      'tertiaryColor:dark': '#d5b296',
    },
    scaleLabelColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    actorBkg: {
      none: '#fff4dd',
      'primaryColor:light': '#ffd966',
      'primaryColor:dark': '#2a4d69',
      'mainBkg:light': '#ffd966',
      'mainBkg:dark': '#2a4d69',
    },
    actorBorder: {
      none: '#eeddbb',
      'primaryColor:light': '#d6b85c',
      'primaryColor:dark': '#2f3031',
      darkMode: '#ffffff',
    },
    gradientStart: {
      none: '#eeddbb',
      'primaryColor:light': '#d6b85c',
      'primaryColor:dark': '#2f3031',
      darkMode: '#ffffff',
    },
    gradientStop: {
      none: '#ddbbee',
      'primaryColor:light': '#b85cd6',
      'primaryColor:dark': '#30312f',
      'secondaryColor:light': '#d6b85c',
      'secondaryColor:dark': '#2f3031',
      darkMode: '#ffffff',
    },
  },
};

/**
 * Each difference from v12, keyed `theme / override / variable`, grouped by the decision that
 * accounts for it (D568): every group names a D-id, and each has a MIGRATION.md row.
 */
const DIFFERENCES: Readonly<Record<string, readonly string[]>> = {
  "D29 (R-THEME-9): v13 meets AA where v12 does not: dark's #b8b6b6 text on #474949 (4.49:1) and #585858 label fill under #ccc text (4.43:1); base's #333 node text on a dark primaryColor or mainBkg":
    [
      ...keys('dark', ALL, ['noteTextColor', 'secondaryTextColor']),
      ...keys('base', ['primaryColor:dark', 'mainBkg:dark'], ['nodeTextColor']),
    ],
  "D71: v13's shared border rule (15% black, 20% white under darkMode) approximates v12's mkBorder (saturation -40, lightness ∓10)":
    [
      ...keys('base', ALL, [
        'actorBorder',
        'border2',
        'clusterBorder',
        'gradientStart',
        'gradientStop',
        'nodeBorder',
        'noteBorderColor',
        'primaryBorderColor',
        'secondaryBorderColor',
        'tertiaryBorderColor',
      ]),
    ],
  "D71: v13 picks text ink by contrast (primaryTextColor or background) where v12 base inverts the fill's colour; base's errorTextColor follows tertiaryTextColor, as v12 (#825)":
    [
      ...keys('base', ALL, [
        'errorTextColor',
        'secondaryTextColor',
        'tertiaryTextColor',
        'titleColor',
      ]),
    ],
  "D628: every edge label is filled with the theme background, where v12 used its own label fill (secondaryColor, or the theme's literal); neutral's was white, its background, until an author moves the background":
    [
      ...keys('default', ALL, ['edgeLabelBackground']),
      ...keys('dark', ALL, ['edgeLabelBackground']),
      ...keys('forest', ALL, ['edgeLabelBackground']),
      ...keys('base', ALL, ['edgeLabelBackground']),
      ...keys('neutral', ['background:light', 'background:dark'], ['edgeLabelBackground']),
    ],
  "D571: v12's darkMode turns base's primaryTextColor (and the text that follows it) to #eee and dark's and neutral's scaleLabelColor to black; v13's darkMode switches only the derivation rules":
    [
      ...keys(
        'base',
        ['darkMode'],
        ['nodeTextColor', 'primaryTextColor', 'scaleLabelColor', 'textColor']
      ),
      ...keys('dark', ['darkMode'], ['scaleLabelColor']),
      ...keys('neutral', ['darkMode'], ['scaleLabelColor']),
    ],
  "D575: arrowheadColor follows lineColor, as v12's .marker paints arrowheads; v12's getThemeVariables() keeps default's and dark's constructor value and base's invert(background), which reached only the legacy .arrowheadPath, so the variable differs and the render matches":
    [
      ...(['default', 'dark', 'base'] as const).flatMap((theme) =>
        keys(theme, ['lineColor:light', 'lineColor:dark'], ['arrowheadColor'])
      ),
    ],
  "D576: forest's sequence participant border stays v12's darken(#cde498, 20) (softBorder, pinned); v12 recomputes it from an author's mainBkg":
    [...keys('forest', ['mainBkg:light', 'mainBkg:dark'], ['actorBorder'])],
};

/** Every colour variable in core's vocabulary. */
const COLOURS = Object.entries(THEME_VARIABLES)
  .filter(([, d]) => d.kind === 'color')
  .map(([name]) => name);

/**
 * The colour variables v12 does not resolve: v13's shared inputs (D332), `nodeTextColor`, which
 * only v12 base sets, and `border1`, which v12 base leaves unset.
 */
function notInV12(theme: Classic): string[] {
  const own = COLOURS.filter((n) => D332_INPUTS.includes(n));
  return [...own, theme === 'base' ? 'border1' : 'nodeTextColor'];
}

describe('shared colour variables under one override, against v12 12.2.0 (#796, D151, D654)', () => {
  it.each(THEMES)('%s: compares every colour v12 resolves', (theme) => {
    const compared = Object.keys(V12[theme]);
    expect(COLOURS.filter((n) => !compared.includes(n)).sort()).toEqual(notInV12(theme).sort());
  });

  describeSharedOverrides({ reference: V12, differences: DIFFERENCES });
});
