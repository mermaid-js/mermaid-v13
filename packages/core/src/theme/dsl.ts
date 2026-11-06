/**
 * The derivation DSL (DESIGN §8.1 item 2). A rule is a small expression over theme
 * variables and colour literals:
 *
 *   mix(a, b, 15%)      a with 15% of b, `color-mix(in srgb, a 85%, b)`
 *   lighten(a, 15%)     mix(a, white, 15%)
 *   darken(a, 15%)      mix(a, black, 15%)
 *   lightenHsl(a, 5%)   a with 5 added to its HSL lightness, clamped (khroma's `lighten`, which
 *                       v12 themes used), `hsl(from a h s clamp(0, l + 5, 100) / alpha)` (D117)
 *   darkenHsl(a, 5%)    the same, subtracting 5 (khroma's `darken`)
 *   alpha(a, 80%)       a at 80% opacity, `color-mix(in srgb, a 80%, transparent)`
 *   contrast(bg, a, b)  a, unless it misses AA on bg and b reads better (WCAG ratio); in CSS
 *                       the choice follows bg live, between a's and b's theme values
 *   invert(a)           the sRGB inverse, `color(from a srgb calc(1 - r) …)`
 *   adjust(a, 5, -5, 0) 5, -5 and 0 added to a's red, green and blue (0–255), each clamped
 *                       (khroma's `adjust`, which v12's quadrant fills used, D232),
 *                       `rgb(from a clamp(0, r + 5, 255) clamp(0, g - 5, 255) … / alpha)`
 *   adjustHue(a, 30)    a with its HSL hue turned by 30 degrees (khroma's `adjust(a, { h })`,
 *                       v12's `cScale` hue steps, D258), `hsl(from a calc(h + 30) s l / alpha)`
 *   ifSet(v, b)         the variable v when the author sets it, else b (v12's `v || b`, D258),
 *                       `var(--mermaid-v, b)`
 *
 * An identifier is a theme variable when the table knows it, otherwise a CSS colour name.
 * Each rule compiles to a CSS expression over the private aliases (DESIGN §8.1 item 2) and to the same value in
 * JS (`color.ts`), so `output.cssVariables: false` writes the colour a browser would compute.
 */

export type Expr =
  | { readonly k: 'ref'; readonly name: string }
  | { readonly k: 'lit'; readonly text: string }
  | { readonly k: 'pct'; readonly value: number }
  | { readonly k: 'num'; readonly value: number }
  | { readonly k: 'call'; readonly fn: Fn; readonly args: readonly Expr[] };

export type Fn =
  | 'mix'
  | 'lighten'
  | 'darken'
  | 'lightenHsl'
  | 'darkenHsl'
  | 'alpha'
  | 'contrast'
  | 'invert'
  | 'adjust'
  | 'adjustHue'
  | 'ifSet';

const ARITY: Readonly<Record<Fn, number>> = {
  mix: 3,
  lighten: 2,
  darken: 2,
  lightenHsl: 2,
  darkenHsl: 2,
  alpha: 2,
  contrast: 3,
  invert: 1,
  adjust: 4,
  adjustHue: 2,
  ifSet: 2,
};

const RE_TOKEN =
  /\s*(?:([A-Za-z][\w-]{0,63})|(#[0-9A-Fa-f]{3,8})|(\d{1,3}(?:\.\d{1,4})?)%|([(),])|([+-]?\d{1,3}(?:\.\d{1,4})?))/y;

/** Parses a rule. Throws a SyntaxError naming the rule on anything else. */
export function parseRule(source: string): Expr {
  let at = 0;
  const fail = (why: string): never => {
    throw new SyntaxError(`Theme rule ${JSON.stringify(source)}: ${why} at ${at}`);
  };
  const next = (): RegExpExecArray | undefined => {
    RE_TOKEN.lastIndex = at;
    const m = RE_TOKEN.exec(source);
    if (!m) return undefined;
    at = RE_TOKEN.lastIndex;
    return m;
  };
  const peekSymbol = (): string | undefined => {
    RE_TOKEN.lastIndex = at;
    return RE_TOKEN.exec(source)?.[4];
  };
  const expr = (depth: number): Expr => {
    if (depth > 8) fail('nested too deep');
    const m = next() ?? fail('expected a value');
    if (m[3] !== undefined) return { k: 'pct', value: Number(m[3]) };
    if (m[5] !== undefined) return { k: 'num', value: Number(m[5]) };
    if (m[2] !== undefined) return { k: 'lit', text: m[2] };
    const word = m[1] ?? fail('expected a value');
    if (peekSymbol() !== '(') return { k: 'ref', name: word };
    if (!Object.prototype.hasOwnProperty.call(ARITY, word)) fail(`unknown function ${word}`);
    const fn = word as Fn;
    next();
    const args: Expr[] = [];
    for (;;) {
      args.push(expr(depth + 1));
      const p = next()?.[4];
      if (p === ')') break;
      if (p !== ',') fail('expected , or )');
    }
    if (args.length !== ARITY[fn]) fail(`${fn} takes ${ARITY[fn]} arguments`);
    return { k: 'call', fn, args };
  };
  const e = expr(0);
  if (source.slice(at).trim() !== '') fail('unexpected text');
  return e;
}

/** The variables a rule reads (identifiers known to `isVar`). */
export function ruleRefs(e: Expr, isVar: (name: string) => boolean, out: string[] = []): string[] {
  if (e.k === 'ref' && isVar(e.name)) out.push(e.name);
  if (e.k === 'call') for (const a of e.args) ruleRefs(a, isVar, out);
  return out;
}
