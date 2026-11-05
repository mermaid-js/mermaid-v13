/**
 * The user journey's section fills `fillType0`–`fillType7` (#327, D241) as literal values.
 * v12 derives them per theme as `primaryColor`, `secondaryColor` and their khroma hue turns
 * by ±64° and 128°; redux-color takes `bkgColorArray`, redux-dark-color fixed 900 shades. The
 * theme DSL has no hue turn, so each spec pins v12 12.2.0's resolved values (checked by
 * `packages/conformance/src/journey/theme.spec.ts`). A custom `primaryColor` therefore does
 * not re-derive them, apart from `base`, whose `fillType0` and `fillType1` follow
 * `primaryColor` and `secondaryColor` through the shared rules (`spec.ts`).
 */
export function fillTypes(colours: readonly string[]): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  colours.slice(0, 8).forEach((c, i) => (out[`fillType${i}`] = c));
  return out;
}
