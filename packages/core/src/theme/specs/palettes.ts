/**
 * The redux colour palettes, from v12 `theme-redux-color.js` and `theme-redux-dark-color.js`
 * (D151). Plain data, shared by the two colour themes.
 */

/** `borderColorArray`: Tailwind-400, one per subgraph slot. */
export const TAILWIND_400: readonly string[] = [
  '#e879f9', // fuchsia
  '#2dd4bf', // teal
  '#fb923c', // orange
  '#22d3ee', // cyan
  '#4ade80', // green
  '#a78bfa', // violet
  '#f87171', // red
  '#facc15', // yellow
  '#818cf8', // indigo
  '#a3e635', // lime
  '#38bdf8', // sky
  '#fb7185', // rose
];

/** `bkgColorArray` of `redux-color`: Tailwind-50 in the same hue order. */
export const TAILWIND_50: readonly string[] = [
  '#fdf4ff',
  '#f0fdfa',
  '#fff7ed',
  '#ecfeff',
  '#f0fdf4',
  '#f5f3ff',
  '#fef2f2',
  '#fefce8',
  '#eef2ff',
  '#f7fee7',
  '#f0f9ff',
  '#fff1f2',
];

/** `cScale0`–`cScale11`: v12's fixed Tailwind-300 set (purple in slot 3, not cyan). */
export const TAILWIND_300: readonly string[] = [
  '#f4a8ff',
  '#46ecd5',
  '#ffb86a',
  '#dab2ff',
  '#7bf1a8',
  '#c4b4ff',
  '#ffa2a2',
  '#ffdf20',
  '#a3b3ff',
  '#bbf451',
  '#74d4ff',
  '#ffa1ad',
];

/**
 * The user journey's section fills `fillType0`–`fillType7` (#327, D241) as literal values.
 * v12 derives them per theme as `primaryColor`, `secondaryColor` and their khroma hue turns
 * by ±64° and 128°; redux-color takes `bkgColorArray`, redux-dark-color fixed 900 shades. The
 * theme DSL has no hue turn, so each spec pins v12 12.2.0's resolved values (checked by
 * `packages/conformance/src/journey/theme.spec.ts`). A custom `primaryColor` therefore does
 * not re-derive them, apart from `base`, whose `fillType0` and `fillType1` follow
 * `primaryColor` and `secondaryColor` through the shared rules (`spec.ts`).
 *
 * `colours` is the eight values, space-separated (a list costs the always-loaded core more).
 */
export function fillTypes(colours: string): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  colours.split(' ').forEach((c, i) => (out[`fillType${i}`] = c));
  return out;
}
