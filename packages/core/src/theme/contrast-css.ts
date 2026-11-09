import { formatColor, type Rgba } from './color.ts';

/** A number for CSS calc(), to 6 decimals. */
const dec = (n: number): string => String(Number(n.toFixed(6)));

/** `[r, g, b]` as 0–1 srgb, and alpha. */
const unit = (c: Rgba): [number, number, number, number] => [
  c[0] / 255,
  c[1] / 255,
  c[2] / 255,
  c[3],
];

/**
 * `contrast(bg, a, b)` as live CSS (R-THEME-4): the same choice as the JS rule (a unless it
 * misses AA and b reads better), made by the browser on the current value of `bg`.
 *
 * With the inks fixed, the choice depends only on bg's WCAG luminance L: a wins when
 * L \>= 4.5(La+.05)-.05 or L \<= (La+.05)/4.5-.05 (AA either way), or when L is on a's far side
 * of the geometric midpoint sqrt((La+.05)(Lb+.05))-.05 (a's ratio beats b's). The inner
 * relative colour reads L from bg in srgb-linear (exact WCAG weights) and turns those tests
 * into t = 0 (a) or 1 (b) with steep clamps; the outer one maps t onto the two inks. Limits:
 * the inks are the theme's values (a host override of the ink variables doesn't reach this
 * colour), and bg's own alpha is ignored (the JS rule composites it over the background).
 */
export function contrastCss(bg: string, a: Rgba, b: Rgba, la: number, lb: number): string {
  const ka = la + 0.05;
  const kb = lb + 0.05;
  // Equal luminances tie on every background, and JS keeps a.
  if (la === lb) return formatColor(a);
  // a wins when L >= above or L <= below (the union of the three tests above).
  const mid = Math.sqrt(ka * kb) - 0.05;
  const hi = 4.5 * ka - 0.05;
  const lo = ka / 4.5 - 0.05;
  const above = Math.min(hi, la < lb ? mid : Infinity);
  const below = Math.max(lo, la > lb ? mid : -Infinity);
  const L = '(0.2126*r + 0.7152*g + 0.0722*b)';
  const step = (expr: string) => `clamp(0,(${expr})*1e9,1)`;
  const checks: string[] = [];
  if (above <= 1) checks.push(step(`${L} - ${dec(above)}`));
  if (below >= 0) checks.push(step(`${dec(below)} - ${L}`));
  if (checks.length === 0) return formatColor(b);
  const [ar, ag, ab, aa] = unit(a);
  const [br, bgr, bb, ba] = unit(b);
  const t = `color(from ${bg} srgb-linear calc(1 - max(${checks.join(',')})) 0 0)`;
  const ch = (x: number, y: number) => (x === y ? dec(x) : `calc(${dec(x)} + ${dec(y - x)}*r)`);
  const opaque = aa === ba && aa >= 1;
  const alpha = opaque ? '' : ` / ${ch(aa, ba)}`;
  return `color(from ${t} srgb ${ch(ar, br)} ${ch(ag, bgr)} ${ch(ab, bb)}${alpha})`;
}
