/**
 * Building a render's theme from a `ThemeSpec` and the author's `themeVariables`
 * (DESIGN §8.1, ADR-4).
 *
 * Every variable a renderer asks for is referenced through a short private alias
 * (`var(--_p)`, from Pele's alias layer). The root declares only the aliases used, each as
 * `var(--mermaid-<v12 name>, <fallback>)`: the fallback is the theme value, the author's
 * explicit `themeVariables` value, or the derivation rule compiled to `color-mix(in srgb …)`
 * over other aliases. A host page re-themes by setting `--mermaid-*` and derived colours
 * follow (R-THEME-3, -4). With `cssVariables: false` the same values are written as
 * literals for renderers that do not resolve CSS variables.
 */
import { checkColor, checkStyle } from '../svg/style.ts';
import type { Length, Paint, SafeColor, SafeValue, ThemeRef } from '../svg/types.ts';
import { num } from '../svg/escape.ts';
import {
  composite,
  contrastRatio,
  formatColor,
  invertColor,
  luminance,
  mixColors,
  parseColor,
  type Rgba,
} from './color.ts';
import { parseRule, type Expr } from './dsl.ts';
import { DARK_RULES, LIGHT_RULES, type ThemeRuleTable, type ThemeSpec } from './spec.ts';
import { THEME_VARIABLES, type ThemeVarDef, type ThemeVarKind } from './vocabulary.ts';

export interface ThemeWarning {
  readonly code: 'THEME_VARIABLE_DROPPED' | 'THEME_UNAVAILABLE';
  readonly message: string;
}

export interface ThemeOptions {
  /** The resolved `themeVariables`. Unknown names are ignored (R-CONF-5). */
  readonly themeVariables?: Readonly<Record<string, unknown>>;
  /** `output.cssVariables` (integrator option). `false` writes literal values. Default true. */
  readonly cssVariables?: boolean;
  /** A diagram plugin's own derived colours (DESIGN §12.1 `themeVariables`). */
  readonly rules?: ThemeRuleTable;
  /**
   * `theme: 'auto'` (R-THEME-8): the spec used under `prefers-color-scheme: dark`. Colour
   * aliases then move from the root `style` into `styleSheet()`.
   */
  readonly dark?: ThemeSpec;
  readonly warn?: (warning: ThemeWarning) => void;
}

/** A custom property name for the root `style`. */
export type AliasName = `--_${string}`;

/** One render's theme. It records which variables were used, so it is not shared. */
export interface Theme {
  readonly name: string;
  readonly dark: boolean;
  readonly cssVariables: boolean;
  /** A colour variable as paint: `var(--_x)`, or the literal colour. */
  color(name: string): Paint;
  /** A length variable (stroke width, font size, token) for an attribute. */
  length(name: string): Length;
  /** A length or size variable as a number, for geometry and measuring. */
  number(name: string): number;
  /** The font family, for `font-family`. */
  font(name?: string): SafeValue | ThemeRef;
  /** The variable's computed value as written in literal mode. */
  value(name: string): string;
  /** The variable's colour channels, when JS can compute them. */
  rgba(name: string): Rgba | undefined;
  /**
   * Ink for text on a fill the author chose (R-THEME-12): undefined when the theme's node
   * text reads on it, else a colour that does. Unknown and mostly transparent fills keep
   * the theme ink.
   */
  ink(fill: string): SafeColor | undefined;
  /** Declarations for the root `style`: the aliases used so far and what they depend on. */
  rootStyle(): Readonly<Record<AliasName, ThemeRef>>;
  /** The colour aliases for light and dark, for `theme: 'auto'`; undefined otherwise. */
  autoDeclarations(): AutoDeclarations | undefined;
}

export interface AutoDeclarations {
  readonly light: Readonly<Record<AliasName, ThemeRef>>;
  readonly dark: Readonly<Record<AliasName, ThemeRef>>;
}

interface Resolved {
  /** The fallback inside `var(--mermaid-x, …)`. */
  readonly css: string;
  /** The value in literal mode. */
  readonly lit: string;
  readonly rgba: Rgba | undefined;
  /** Variables `css` references. */
  readonly deps: readonly string[];
}

const RE_SIZE = /^(\d{1,6}(?:\.\d{1,6})?)(?:px)?$/;
const WEIGHTS = new Set([
  'normal',
  'bold',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
]);
const BLACK: Rgba = [0, 0, 0, 1];
const WHITE: Rgba = [255, 255, 255, 1];
const AA = 4.5;

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

function checkValue(kind: ThemeVarKind, raw: unknown): string | undefined {
  if (typeof raw === 'number')
    return kind === 'length' || kind === 'weight' ? checkValue(kind, String(raw)) : undefined;
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim();
  switch (kind) {
    case 'color':
      return checkColor(v);
    case 'length':
      return RE_SIZE.test(v) ? v : undefined;
    case 'weight':
      return WEIGHTS.has(v.toLowerCase()) ? v.toLowerCase() : undefined;
    case 'font':
      return checkStyle(['font-family:' + v]).text['font-family'] as string | undefined;
  }
}

const parsed = new Map<string, Expr>();
function rule(source: string): Expr {
  let e = parsed.get(source);
  if (!e) {
    e = parseRule(source);
    parsed.set(source, e);
  }
  return e;
}

/** Resolves every variable of one spec under one set of overrides. */
class Resolver {
  private readonly memo = new Map<string, Resolved>();
  private readonly active = new Set<string>();

  constructor(
    private readonly spec: ThemeSpec,
    private readonly rules: ThemeRuleTable,
    private readonly overrides: ReadonlyMap<string, string>,
    private readonly defs: Readonly<Record<string, ThemeVarDef>>
  ) {}

  /** The spec's own value or rule, ignoring overrides. */
  private source(name: string): string | undefined {
    const s = this.spec;
    if (own(s.base, name)) return (s.base as Record<string, string>)[name];
    if (own(s.tokens, name)) return String((s.tokens as Record<string, number | string>)[name]);
    if (s.values && own(s.values, name)) return s.values[name];
    return undefined;
  }

  get(name: string): Resolved {
    const hit = this.memo.get(name);
    if (hit) return hit;
    if (this.active.has(name)) throw new Error(`Theme rule cycle through ${name}`);
    this.active.add(name);
    const r = this.compute(name);
    this.active.delete(name);
    this.memo.set(name, r);
    return r;
  }

  private literal(name: string, text: string): Resolved {
    const kind = this.defs[name]?.kind ?? 'color';
    if (kind === 'length') {
      const n = Number(RE_SIZE.exec(text)?.[1] ?? 0);
      return { css: num(n) + 'px', lit: num(n), rgba: undefined, deps: [] };
    }
    if (kind !== 'color') return { css: text, lit: text, rgba: undefined, deps: [] };
    return { css: text, lit: text, rgba: parseColor(text), deps: [] };
  }

  private compute(name: string): Resolved {
    const user = this.overrides.get(name);
    if (user !== undefined) {
      const r = this.literal(name, user);
      // A colour JS cannot compute (oklch, var()) keeps the theme's value for derivation.
      if (r.rgba !== undefined || this.defs[name]?.kind !== 'color') return r;
      return { ...r, rgba: this.fromSpec(name)?.rgba };
    }
    return (
      this.fromSpec(name) ?? { css: 'currentColor', lit: 'currentColor', rgba: undefined, deps: [] }
    );
  }

  private fromSpec(name: string): Resolved | undefined {
    const text = this.source(name);
    if (text !== undefined) return this.literal(name, text);
    const r = own(this.rules, name) ? this.rules[name] : undefined;
    return r === undefined ? undefined : this.evaluate(rule(r));
  }

  private evaluate(e: Expr): Resolved {
    switch (e.k) {
      case 'pct':
        throw new SyntaxError('A percentage is only an argument of mix, lighten, darken or alpha');
      case 'lit':
        return this.literal('', e.text);
      case 'ref': {
        if (!own(this.defs, e.name)) {
          if (parseColor(e.name) === undefined) throw new SyntaxError(`Unknown colour ${e.name}`);
          return this.literal('', e.name);
        }
        const r = this.get(e.name);
        return {
          css: `var(--_${(this.defs[e.name] as ThemeVarDef).alias})`,
          lit: r.lit,
          rgba: r.rgba,
          deps: [e.name],
        };
      }
      case 'call':
        return this.call(e);
    }
  }

  private call(e: Expr & { k: 'call' }): Resolved {
    const pct = (x: Expr | undefined): number => {
      if (x?.k !== 'pct' || x.value > 100) throw new SyntaxError(`${e.fn} needs a percentage`);
      return x.value;
    };
    const [x, y, z] = e.args as [Expr, Expr | undefined, Expr | undefined];
    switch (e.fn) {
      case 'mix':
        return this.mix(this.evaluate(x), this.evaluate(y as Expr), pct(z));
      case 'lighten':
        return this.mix(this.evaluate(x), this.literal('', 'white'), pct(y));
      case 'darken':
        return this.mix(this.evaluate(x), this.literal('', 'black'), pct(y));
      case 'alpha': {
        const a = this.evaluate(x);
        const p = pct(y);
        const rgba = a.rgba && mixColors(a.rgba, [0, 0, 0, 0], p / 100);
        return {
          css: `color-mix(in srgb,${a.css} ${num(p)}%,transparent)`,
          lit: rgba ? formatColor(rgba) : a.lit,
          rgba,
          deps: a.deps,
        };
      }
      case 'invert': {
        const a = this.evaluate(x);
        const rgba = a.rgba && invertColor(a.rgba);
        const lit = rgba ? formatColor(rgba) : a.lit;
        // Relative colour syntax, so the inverse follows a host override of `a` (R-THEME-4).
        const css = `color(from ${a.css} srgb calc(1 - r) calc(1 - g) calc(1 - b) / alpha)`;
        return { css, lit, rgba, deps: a.deps };
      }
      case 'contrast': {
        const on = this.evaluate(x);
        const bg = this.opaque(on.rgba);
        const a = this.evaluate(y as Expr);
        const b = this.evaluate(z as Expr);
        if (!bg || !a.rgba || !b.rgba) return a;
        const oa = this.opaque(a.rgba, bg) as Rgba;
        const ob = this.opaque(b.rgba, bg) as Rgba;
        const ra = contrastRatio(oa, bg);
        const rb = contrastRatio(ob, bg);
        const pick = ra >= AA || ra >= rb ? a : b;
        const css = contrastCss(on.css, a.rgba, b.rgba, luminance(oa), luminance(ob));
        return { css, lit: pick.lit, rgba: pick.rgba, deps: on.deps };
      }
    }
  }

  private mix(a: Resolved, b: Resolved, p: number): Resolved {
    const rgba = a.rgba && b.rgba && mixColors(a.rgba, b.rgba, 1 - p / 100);
    return {
      css: `color-mix(in srgb,${a.css} ${num(100 - p)}%,${b.css})`,
      lit: rgba ? formatColor(rgba) : a.lit,
      rgba,
      deps: [...a.deps, ...b.deps],
    };
  }

  /** A colour composited over `under` (default: the background), so contrast is honest. */
  opaque(c: Rgba | undefined, under?: Rgba): Rgba | undefined {
    if (!c || c[3] >= 1) return c;
    const bg = under ?? this.opaque(this.get('background').rgba, WHITE) ?? WHITE;
    return composite(c, bg);
  }
}

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
 * L >= 4.5(La+.05)-.05 or L <= (La+.05)/4.5-.05 (AA either way), or when L is on a's far side
 * of the geometric midpoint sqrt((La+.05)(Lb+.05))-.05 (a's ratio beats b's). The inner
 * relative colour reads L from bg in srgb-linear (exact WCAG weights) and turns those tests
 * into t = 0 (a) or 1 (b) with steep clamps; the outer one maps t onto the two inks. Limits:
 * the inks are the theme's values (a host override of the ink variables doesn't reach this
 * colour), and bg's own alpha is ignored (the JS rule composites it over the background).
 */
function contrastCss(bg: string, a: Rgba, b: Rgba, la: number, lb: number): string {
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
  const alpha = aa === ba ? (aa >= 1 ? '' : ` / ${dec(aa)}`) : ` / ${ch(aa, ba)}`;
  return `color(from ${t} srgb ${ch(ar, br)} ${ch(ag, bgr)} ${ch(ab, bb)}${alpha})`;
}

function checkOverrides(
  vars: Readonly<Record<string, unknown>> | undefined,
  defs: Readonly<Record<string, ThemeVarDef>>,
  warn: ThemeOptions['warn']
): Map<string, string> {
  const out = new Map<string, string>();
  if (!vars) return out;
  for (const name of Object.keys(vars)) {
    const def = own(defs, name) ? defs[name] : undefined;
    const raw = vars[name];
    if (!def || raw === undefined || raw === null || raw === '') continue;
    const v = checkValue(def.kind, raw);
    if (v === undefined) {
      warn?.({
        code: 'THEME_VARIABLE_DROPPED',
        message: `themeVariables.${name} value ${JSON.stringify(String(raw).slice(0, 60))} is not allowed and was dropped.`,
      });
      continue;
    }
    out.set(name, v);
  }
  return out;
}

/** Builds one render's theme. */
export function createTheme(spec: ThemeSpec, options: ThemeOptions = {}): Theme {
  const tv = options.themeVariables;
  const defs: Record<string, ThemeVarDef> = { ...THEME_VARIABLES };
  if (options.rules)
    for (const name of Object.keys(options.rules))
      if (!own(defs, name)) defs[name] = { alias: name, kind: 'color', usedBy: [] };
  const overrides = checkOverrides(tv, defs, options.warn);
  const darkMode = spec.dark || tv?.darkMode === true || tv?.darkMode === 'true';
  const rulesFor = (s: ThemeSpec, dark: boolean): ThemeRuleTable => ({
    ...(dark ? DARK_RULES : LIGHT_RULES),
    ...s.rules,
    ...options.rules,
  });
  const main = new Resolver(spec, rulesFor(spec, darkMode), overrides, defs);
  const night =
    options.dark && new Resolver(options.dark, rulesFor(options.dark, true), overrides, defs);
  const vars = options.cssVariables !== false;
  const used = new Set<string>();

  const def = (name: string): ThemeVarDef => {
    const d = own(defs, name) ? defs[name] : undefined;
    if (!d) throw new TypeError(`Unknown theme variable ${JSON.stringify(name)}`);
    return d;
  };
  const ref = (name: string): ThemeRef => {
    used.add(name);
    return `var(--_${def(name).alias})` as ThemeRef;
  };
  const decls = (r: Resolver, names: Iterable<string>, colours: boolean | undefined) => {
    const out: Record<AliasName, ThemeRef> = {};
    const seen = new Set<string>();
    const visit = (name: string): void => {
      if (seen.has(name)) return;
      seen.add(name);
      const res = r.get(name);
      const d = def(name);
      if (colours === undefined || (d.kind === 'color') === colours)
        out[`--_${d.alias}`] = `var(--mermaid-${name},${res.css})` as ThemeRef;
      for (const dep of res.deps) visit(dep);
    };
    for (const name of names) visit(name);
    return out;
  };

  return {
    name: spec.name,
    dark: darkMode,
    cssVariables: vars,
    color(name) {
      if (def(name).kind !== 'color') throw new TypeError(`${name} is not a colour`);
      return vars ? ref(name) : (main.get(name).lit as SafeColor);
    },
    length(name) {
      if (def(name).kind !== 'length') throw new TypeError(`${name} is not a length`);
      return vars ? ref(name) : Number(main.get(name).lit);
    },
    number(name) {
      if (def(name).kind !== 'length') throw new TypeError(`${name} is not a length`);
      return Number(main.get(name).lit);
    },
    font(name = 'fontFamily') {
      return vars ? ref(name) : (main.get(name).lit as SafeValue);
    },
    value: (name) => main.get(name).lit,
    rgba: (name) => main.get(name).rgba,
    ink(fill) {
      const c = parseColor(fill);
      if (!c || c[3] < 0.5) return undefined;
      const bg = main.opaque(c) as Rgba;
      const text = main.get('nodeTextColor').rgba;
      if (text && contrastRatio(main.opaque(text, bg) as Rgba, bg) >= AA) return undefined;
      return (
        contrastRatio(BLACK, bg) >= contrastRatio(WHITE, bg) ? '#000000' : '#ffffff'
      ) as SafeColor;
    },
    rootStyle: () => (vars ? decls(main, used, night ? false : undefined) : {}),
    autoDeclarations: () =>
      vars && night
        ? { light: decls(main, used, true), dark: decls(night, used, true) }
        : undefined,
  };
}
