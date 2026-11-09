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
import {
  checkColor,
  checkFilter,
  checkStyle,
  splitTopLevel,
  styleScope,
  styleText,
} from '../svg/style.ts';
import type {
  GradientRef,
  Length,
  OutlinePaint,
  Paint,
  SafeColor,
  SafeFilter,
  SafeValue,
  StopColor,
  StyleText,
  ThemeRef,
} from '../svg/types.ts';
import { num } from '../svg/escape.ts';
import {
  adjustChannels,
  composite,
  contrastRatio,
  formatColor,
  hslToRgb,
  invertColor,
  khromaRgb,
  luminance,
  mixColors,
  parseColor,
  rgbToHsl,
  shiftHsl,
  type Hsl,
  type Rgba,
} from './color.ts';
import type { DiagramThemeFamily, DiagramThemeTable, ThemeFamily } from './diagram.ts';
import { contrastCss } from './contrast-css.ts';
import { parseRule, type Expr, type Fn } from './dsl.ts';
import { DARK_RULES, LIGHT_RULES, type ThemeRuleTable, type ThemeSpec } from './spec.ts';
import { BASE_PLOT, BASE_SERIES } from './specs/palettes.ts';
import { baseScalesFor } from './specs/scales.ts';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';
import {
  GIT_PALETTE_LIMIT,
  PALETTE_LIMIT,
  PALETTE_SLOT,
  PALETTE_VARIABLES,
  type PaletteVariable,
  type ThemeVarEntry,
  type ThemeVarKind,
} from './vocabulary.ts';

export interface ThemeWarning {
  readonly code: 'THEME_VARIABLE_DROPPED' | 'THEME_UNAVAILABLE';
  readonly message: string;
}

export interface ThemeOptions {
  /** The resolved `themeVariables`. Unknown names are ignored (R-CONF-5). */
  readonly themeVariables?: Readonly<Record<string, unknown>>;
  /** `output.cssVariables` (integrator option). `false` writes literal values. Default true. */
  readonly cssVariables?: boolean;
  /**
   * The registered plugin fragments' derived colours (DESIGN §12.1 `themeVariables`). A name the
   * diagram's own table defines keeps the table's (D337).
   */
  readonly rules?: ThemeRuleTable;
  /** The diagram's own theme table (`DiagramPlugin.theme`, D331); none for core's own output. */
  readonly diagram?: DiagramThemeTable;
  /**
   * `theme: 'auto'` (R-THEME-8): the spec used under `prefers-color-scheme: dark`. Colour
   * aliases then move from the root `style` into `styleSheet()`.
   */
  readonly dark?: ThemeSpec;
  readonly warn?: (warning: ThemeWarning) => void;
  /**
   * The render's id prefix, read only when the gradient is on (the pipeline computes it
   * lazily). Default `mermaid`.
   */
  readonly idPrefix?: () => string;
}

/** The render's gradient (D182), for the writer to emit as `<defs>`. */
export interface ThemeGradient {
  /** `<scope>-gradient`, the scope being the id prefix as an XML name (`styleScope`). */
  readonly id: string;
  readonly start: StopColor;
  readonly stop: StopColor;
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
  /**
   * The paint for an outline (D182): the render's gradient when `useGradient` is on, else
   * {@link color}. Renderers call it where v12 neo strokes with the gradient.
   */
  outline(name: string): OutlinePaint;
  /** The gradient an {@link outline} refers to; undefined while `useGradient` is off. */
  gradient(): ThemeGradient | undefined;
  /** A length variable (stroke width, font size, token) for an attribute. */
  length(name: string): Length;
  /** A length or size variable as a number, for geometry and measuring. */
  number(name: string): number;
  /**
   * A `padding` variable as a number (D152): a px value as is, or a multiple of the diagram's
   * own `padding` config, which the caller passes.
   */
  padding(name: string, padding: number): number;
  /** The font family, for `font-family`. */
  font(name?: string): SafeValue | ThemeRef;
  /** A filter variable (`dropShadow`) for the `filter` attribute: `var(--_x)` or the literal. */
  filter(name: string): SafeFilter | ThemeRef;
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
  /** {@link rootStyle} as checked `style` text, to pass as the tail of `styleText`. */
  rootStyleText(): StyleText;
  /** The colour aliases for light and dark, for `theme: 'auto'`; undefined otherwise. */
  autoDeclarations(): AutoDeclarations | undefined;
  /**
   * A palette as literal colours (D151, D152): the author's `themeVariables` list if valid,
   * else the theme's; empty when the theme carries none. `name` is a shared palette
   * (`PALETTE_VARIABLES`) or a `palette` variable of the diagram's table, which reads the shared
   * palette its rule names unless the author lists its own (D545).
   */
  palette(name: PaletteVariable | (string & {})): readonly SafeColor[];
  /** {@link palette}'s entries as colour channels, where JS can compute them. */
  paletteRgba(name: PaletteVariable | (string & {})): readonly (Rgba | undefined)[];
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
  /**
   * khroma's HSL channels, when an HSL step made the colour: the next HSL step starts from
   * them, so a hue survives lightness 0 or 100 as it does in v12 (D258).
   */
  readonly hsl?: Hsl;
  /** Variables `css` references. */
  readonly deps: readonly string[];
}

const RE_SIZE = /^(\d{1,6}(?:\.\d{1,6})?)(?:px)?$/;
/** A multiple of the diagram's padding: `padding` or `<n> * padding`. */
const RE_PADDING = /^(?:(\d{1,6}(?:\.\d{1,6})?)\s*\*\s*)?padding$/;
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

/** A value of every kind but `palette`, a list that `paletteSource` checks. */
function checkValue(kind: Exclude<ThemeVarKind, 'palette'>, raw: unknown): string | undefined {
  if (typeof raw === 'boolean') return kind === 'flag' ? String(raw) : undefined;
  if (typeof raw === 'number')
    return kind === 'length' || kind === 'padding' || kind === 'weight' || kind === 'opacity'
      ? checkValue(kind, String(raw))
      : undefined;
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim();
  switch (kind) {
    case 'color':
      return checkColor(v);
    case 'length':
      return RE_SIZE.test(v) ? v : undefined;
    case 'padding':
      return RE_SIZE.test(v) || RE_PADDING.test(v) ? v : undefined;
    case 'weight':
      return WEIGHTS.has(v.toLowerCase()) ? v.toLowerCase() : undefined;
    case 'font':
      return checkStyle(['font-family:' + v]).text['font-family'] as string | undefined;
    case 'filter':
      return checkFilter(v);
    case 'flag': {
      const f = v.toLowerCase();
      return f === 'true' || f === 'false' ? f : undefined;
    }
    case 'opacity':
      // A plain number from 0 to 1 (D221): `RE_SIZE` without its `px`.
      return RE_SIZE.test(v) && +v <= 1 ? v : undefined;
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

/** A call of a colour function; `literal()`, `inline()` and `slot()` are handled by `evaluate`. */
type Call = Expr & { k: 'call'; fn: Exclude<Fn, 'literal' | 'inline' | 'slot'> };

/** Resolves every variable of one spec under one set of overrides. */
class Resolver {
  private readonly memo = new Map<string, Resolved>();
  private readonly active = new Set<string>();

  constructor(
    private readonly spec: ThemeSpec,
    private readonly rules: ThemeRuleTable,
    /**
     * What the theme writes beyond its base, tokens and values: the diagram's family values and
     * tokens (D331), which beat every rule as spec values do, and the names the spec's rules and
     * the family's rules write, for `inline(v, b)`.
     */
    private readonly writes: { readonly lits: Literals; readonly rules: ReadonlySet<string> },
    private readonly overrides: ReadonlyMap<string, string>,
    private readonly defs: Readonly<Record<string, ThemeVarEntry>>,
    private readonly palettes: PaletteSource = NO_PALETTES
  ) {}

  private readonly slots = new Map<string, Resolved | undefined>();

  /**
   * Entry `i` of a palette: the author's numbered override, else the author's list, else the
   * theme's colour or rule, else for the series v12 theme-base's derivation (`BASE_SERIES`).
   * Undefined past the end of every list.
   */
  slot(p: string, i: number): Resolved | undefined {
    const key = `${p}${i}`;
    // Only theme specs write palette rules, so no author input can make a cycle here.
    if (this.slots.has(key)) return this.slots.get(key);
    const user = this.palettes.slots.get(key) ?? this.palettes.user[p]?.[i];
    const entry =
      user === undefined
        ? (this.palettes.spec[p]?.[i] ?? (p === 'seriesColorArray' ? BASE_SERIES[i] : undefined))
        : undefined;
    let r: Resolved | undefined;
    if (user !== undefined) r = this.literal('', user);
    else if (entry !== undefined) r = this.evaluate(rule(entry));
    this.slots.set(key, r);
    return r;
  }

  /**
   * The palette's entries as literal colours, or as channels. A table's `palette` variable the
   * author leaves unset reads the shared palette its rule names (D545); any other rule, none.
   */
  palette(p: string): SafeColor[];
  palette(p: string, rgba: true): (Rgba | undefined)[];
  palette(p: string, rgba?: true): (SafeColor | Rgba | undefined)[] {
    const reads = this.defs[p]?.kind === 'palette' && !this.palettes.user[p] && this.rules[p];
    const source = reads && (PALETTE_VARIABLES as readonly string[]).includes(reads) ? reads : p;
    const n = (this.palettes.user[source] ?? this.palettes.spec[source] ?? []).length;
    return Array.from({ length: n }, (_, i) => {
      const r = this.slot(source, i);
      return rgba ? r?.rgba : ((checkColor(r?.lit ?? '') ?? 'currentColor') as SafeColor);
    });
  }

  /**
   * Whether the theme wrote `name`: the spec's base, tokens, values or rules, or a family entry.
   * A shared or diagram light/dark rule does not count, nor does the author's override.
   */
  private isSet(name: string): boolean {
    return this.source(name) !== undefined || this.writes.rules.has(name);
  }

  /** The spec's own value or rule, ignoring overrides. */
  private source(name: string): string | undefined {
    const s = this.spec;
    if (own(s.base, name)) return (s.base as Record<string, string>)[name];
    if (own(s.tokens, name))
      return String((s.tokens as Record<string, number | string | boolean>)[name]);
    if (s.values && own(s.values, name)) return s.values[name];
    const { lits } = this.writes;
    return own(lits, name) ? String(lits[name]) : undefined;
  }

  get(name: string): Resolved {
    return this.once(name, name, () => this.compute(name));
  }

  /**
   * `name` as the theme wrote it, for `inline()`: its value or rule, never the author's override
   * of it. The rule's own references still follow their overrides.
   */
  private written(name: string): Resolved {
    return this.once(' ' + name, name, () => this.fromSpec(name) ?? this.unset(name));
  }

  private once(key: string, name: string, f: () => Resolved): Resolved {
    const hit = this.memo.get(key);
    if (hit) return hit;
    if (this.active.has(key)) throw new Error(`Theme rule cycle through ${name}`);
    this.active.add(key);
    const r = f();
    this.active.delete(key);
    this.memo.set(key, r);
    return r;
  }

  private unset(name: string): Resolved {
    const fallback = this.defs[name]?.kind === 'filter' ? 'none' : 'currentColor';
    return { css: fallback, lit: fallback, rgba: undefined, deps: [] };
  }

  private literal(name: string, text: string): Resolved {
    const kind = this.defs[name]?.kind ?? 'color';
    if (kind === 'padding') {
      const m = RE_PADDING.exec(text);
      if (m) {
        const lit = `${num(Number(m[1] ?? 1))}*padding`;
        return { css: lit, lit, rgba: undefined, deps: [] };
      }
    }
    if (kind === 'length' || kind === 'padding') {
      const n = Number(RE_SIZE.exec(text)?.[1] ?? 0);
      return { css: num(n) + 'px', lit: num(n), rgba: undefined, deps: [] };
    }
    if (kind !== 'color') return { css: text, lit: text, rgba: undefined, deps: [] };
    return { css: text, lit: text, rgba: parseColor(text), deps: [] };
  }

  private compute(name: string): Resolved {
    if (this.defs[name]?.kind === 'palette') {
      // A palette has no CSS variable: its value is its colours, comma-separated (D545).
      const lit = this.palette(name).join(',');
      return { css: lit, lit, rgba: undefined, deps: [] };
    }
    const user = this.overrides.get(name);
    if (user !== undefined) {
      const r = this.literal(name, user);
      // A colour JS cannot compute (oklch, var()) keeps the theme's value for derivation.
      if (r.rgba !== undefined || this.defs[name]?.kind !== 'color') return r;
      return { ...r, rgba: this.fromSpec(name)?.rgba };
    }
    return this.fromSpec(name) ?? this.unset(name);
  }

  private fromSpec(name: string): Resolved | undefined {
    const text = this.source(name);
    if (text !== undefined) return this.literal(name, text);
    const r = own(this.rules, name) ? this.rules[name] : undefined;
    return r === undefined ? undefined : this.evaluate(rule(r));
  }

  /** A rule's read of palette entry `i`, `bkgColorArray2` or `slot()`'s (D258, D332, D474). */
  private entry(p: string, i: number): Resolved {
    const r = this.slot(p, i);
    // A series entry reads as the theme wrote it, so its CSS follows the base colours as the
    // rule it replaces did (D332).
    if (r && p === 'seriesColorArray') return r;
    // Any other palette entry is a literal colour, so a rule over one is too (D258).
    const lit = r?.lit ?? 'currentColor';
    return { css: lit, lit, rgba: r?.rgba, hsl: r?.hsl, deps: [] };
  }

  private evaluate(e: Expr): Resolved {
    switch (e.k) {
      case 'pct':
        throw new SyntaxError(
          'A percentage is only an argument of mix, lighten, darken, lightenHsl, darkenHsl or alpha'
        );
      case 'num':
        throw new SyntaxError('A plain number is only an argument of adjust or adjustHue');
      case 'lit':
        return this.literal('', e.text);
      case 'ref': {
        const slot = own(this.defs, e.name) ? undefined : PALETTE_SLOT.exec(e.name);
        if (slot) return this.entry(slot[1]!, Number(slot[2]));
        if (!own(this.defs, e.name)) {
          if (parseColor(e.name) === undefined) throw new SyntaxError(`Unknown colour ${e.name}`);
          return this.literal('', e.name);
        }
        const r = this.get(e.name);
        return {
          css: `var(--_${(this.defs[e.name] as ThemeVarEntry).alias})`,
          lit: r.lit,
          rgba: r.rgba,
          hsl: r.hsl,
          deps: [e.name],
        };
      }
      case 'call': {
        const [x] = e.args as [Expr];
        if (e.fn === 'inline') {
          // A shared input as the theme wrote it (D332): its value or rule, CSS included, with
          // no alias of its own, so a diagram reads each theme's own shape byte-identically. The
          // author's override of the input is not read: it reaches only what reads the input
          // itself, as in v12 (an author's scaleLabelColor recolours cScaleLabel, not sequence).
          if (x.k !== 'ref' || !own(this.defs, x.name))
            throw new SyntaxError('inline needs a variable');
          // `inline(v, b)`: b where the theme did not write v.
          const b = e.args[1];
          if (b !== undefined && !this.isSet(x.name)) return this.evaluate(b);
          return this.written(x.name);
        }
        if (e.fn === 'slot') {
          // The slot when the palette is non-empty, else the fallback (D474).
          const [, n, b] = e.args as [Expr, Expr, Expr];
          if (x.k !== 'ref' || !(PALETTE_VARIABLES as readonly string[]).includes(x.name))
            throw new SyntaxError('slot needs a palette');
          if (n.k !== 'num' || !Number.isInteger(n.value) || n.value < 0)
            throw new SyntaxError('slot needs a slot number');
          const list = this.palettes.user[x.name] ?? this.palettes.spec[x.name];
          return list?.length ? this.entry(x.name, n.value) : this.evaluate(b);
        }
        if (e.fn !== 'literal') return this.call(e as Call);
        // The computed colour, written as a literal (D332): a hue turn stays byte-identical
        // to the value a theme pinned.
        const a = this.evaluate(x);
        return { css: a.lit, lit: a.lit, rgba: a.rgba, hsl: a.hsl, deps: [] };
      }
    }
  }

  private call(e: Call): Resolved {
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
      case 'lightenHsl':
      case 'darkenHsl': {
        // khroma's lighten/darken, as v12's classic themes derive with them (D117).
        const a = this.evaluate(x);
        const d = e.fn === 'lightenHsl' ? pct(y) : -pct(y);
        // Clamped as khroma does: relative colour syntax keeps an out-of-range lightness.
        const l = `l ${d < 0 ? '-' : '+'} ${num(Math.abs(d))}`;
        return this.hslStep(a, 0, d, `hsl(from ${a.css} h s clamp(0, ${l}, 100) / alpha)`);
      }
      case 'adjustHue':
        return this.adjustHue(this.evaluate(x), y);
      case 'ifSet':
        return this.ifSet(x, y as Expr);
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
      case 'invert':
        return this.invert(this.evaluate(x));
      case 'adjust': {
        // khroma's adjust(c, { r, g, b }), as v12's quadrant fills derive (D232).
        const a = this.evaluate(x);
        const [r, g, b] = e.args.slice(1).map((arg) => {
          if (arg.k !== 'num' || Math.abs(arg.value) > 255)
            throw new SyntaxError('adjust needs a number from -255 to 255');
          return arg.value;
        }) as [number, number, number];
        // After an HSL step, khroma's own conversion, as for invert (D258).
        const from = a.hsl && a.rgba ? khromaRgb(a.rgba) : a.rgba;
        const rgba = from && adjustChannels(from, r, g, b);
        // Clamped as khroma does: relative colour syntax keeps an out-of-range channel.
        const ch = (c: string, d: number) =>
          `clamp(0, ${c} ${d < 0 ? '-' : '+'} ${num(Math.abs(d))}, 255)`;
        const css = `rgb(from ${a.css} ${ch('r', r)} ${ch('g', g)} ${ch('b', b)} / alpha)`;
        return { css, lit: rgba ? formatColor(rgba) : a.lit, rgba, deps: a.deps };
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

  /**
   * An HSL step (khroma's `adjust`, `lighten`, `darken`; D117, D258). It starts from the HSL
   * channels of an earlier HSL step, as khroma reads v12's hsl() strings.
   */
  private hslStep(a: Resolved, dh: number, dl: number, css: string): Resolved {
    if (!a.rgba) return { css, lit: a.lit, rgba: undefined, deps: a.deps };
    const hsl = shiftHsl(a.hsl ?? rgbToHsl(a.rgba), dh, dl);
    const rgba = hslToRgb(hsl, a.rgba[3]);
    return { css, lit: formatColor(rgba), rgba, hsl, deps: a.deps };
  }

  /** khroma's `adjust(c, { h })`, v12's cScale hue steps (D258). */
  private adjustHue(a: Resolved, deg: Expr | undefined): Resolved {
    const h = deg?.k === 'num' ? deg.value : NaN;
    if (!(Math.abs(h) <= 360)) throw new SyntaxError('adjustHue needs degrees, ±360');
    if (h === 0) return a;
    const turn = `calc(h ${h < 0 ? '-' : '+'} ${num(Math.abs(h))})`;
    return this.hslStep(a, h, 0, `hsl(from ${a.css} ${turn} s l / alpha)`);
  }

  /** v12's `this.v || derived`: the author's value, else the theme's derivation (D258). */
  private ifSet(v: Expr, fallback: Expr): Resolved {
    const slot = v.k === 'ref' && !own(this.defs, v.name) ? PALETTE_SLOT.exec(v.name) : null;
    if (v.k !== 'ref' || (!slot && !own(this.defs, v.name)))
      throw new SyntaxError('ifSet needs a variable');
    const set = slot
      ? this.palettes.slots.has(v.name) ||
        this.palettes.user[slot[1]!]?.[Number(slot[2])] !== undefined
      : this.overrides.has(v.name);
    if (set) return this.evaluate(v);
    const b = this.evaluate(fallback);
    // A palette entry is literal only, so it has no CSS variable to prefer.
    return slot ? b : { ...b, css: `var(--mermaid-${v.name},${b.css})` };
  }

  private invert(a: Resolved): Resolved {
    // After an HSL step, khroma's own conversion, as v12's invert of an hsl() string (D258).
    const from = a.hsl && a.rgba ? khromaRgb(a.rgba) : a.rgba;
    const rgba = from && invertColor(from);
    const lit = rgba ? formatColor(rgba) : a.lit;
    // Relative colour syntax, so the inverse follows a host override of `a` (R-THEME-4).
    const css = `color(from ${a.css} srgb calc(1 - r) calc(1 - g) calc(1 - b) / alpha)`;
    return { css, lit, rgba, deps: a.deps };
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

function checkOverrides(
  vars: Readonly<Record<string, unknown>> | undefined,
  defs: Readonly<Record<string, ThemeVarEntry>>,
  warn: ThemeOptions['warn']
): Map<string, string> {
  const out = new Map<string, string>();
  if (!vars) return out;
  for (const name of Object.keys(vars)) {
    const def = own(defs, name) ? defs[name] : undefined;
    const raw = vars[name];
    // A palette variable is a list, checked with the palettes (`paletteSource`).
    if (!def || def.kind === 'palette' || raw === undefined || raw === null || raw === '') continue;
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

const MAX_PALETTE = 64;
/**
 * v12's numbered palette names (`NUMBERED_PALETTES`): `cScale3`, `cScaleInv3`, `cScaleLabel3`,
 * `git3`, `gitInv3`, `gitBranchLabel3`. v12 reads no leading zero, so `cScale05` is an unknown
 * name, ignored (R-CONF-5).
 */
const RE_SLOT = /^(cScale(?:Inv|Label)?|git(?:Inv|BranchLabel)?)(0|[1-9]\d?)$/;

type PaletteLists = Readonly<Partial<Record<string, readonly string[]>>>;

/** What the palettes of one render are built from (D258). */
interface PaletteSource {
  /** The theme's entries: colours or rules. */
  readonly spec: PaletteLists;
  /** The author's whole lists, checked colours, a table's `palette` variables' among them. */
  readonly user: Readonly<Partial<Record<string, readonly SafeColor[]>>>;
  /** The author's numbered entries (`cScale3`), checked colours. */
  readonly slots: ReadonlyMap<string, SafeColor>;
}

const NO_PALETTES: PaletteSource = { spec: {}, user: {}, slots: new Map() };

/** A palette override as a list: an array as given, or a comma-separated string. */
function paletteItems(raw: unknown): readonly unknown[] | undefined {
  if (Array.isArray(raw)) return raw as unknown[];
  return typeof raw === 'string' ? splitTopLevel(raw, 'comma') : undefined;
}
/** The author's numbered palette entries (`cScale3`) that are safe colours; the rest dropped. */
function numberedOverrides(
  vars: Readonly<Record<string, unknown>>,
  drop: (name: string, raw: unknown) => void
): [string, SafeColor][] {
  const out: [string, SafeColor][] = [];
  for (const key of Object.keys(vars)) {
    const m = RE_SLOT.exec(key);
    const raw = vars[key];
    if (
      !m ||
      // The git palettes have eight slots, the others twelve (D267, D258).
      Number(m[2]) >= (m[1]!.startsWith('g') ? GIT_PALETTE_LIMIT : PALETTE_LIMIT) ||
      raw === undefined ||
      raw === null ||
      raw === ''
    )
      continue;
    const c = typeof raw === 'string' ? checkColor(raw) : undefined;
    if (c === undefined) drop(key, raw);
    else out.push([key, c]);
  }
  return out;
}

const SCALE_PALETTES = ['cScale', 'cScaleInv', 'cScaleLabel', 'git', 'gitInv', 'gitBranchLabel'];

/**
 * `lists` with the scale and git palettes it leaves out taken from v12 theme-base's derivation
 * over the base colours (`baseScalesFor`). An inverse whose palette the theme writes inverts
 * that palette's slots, as v12 derives one from a fixed `cScale`; the built-in themes write all
 * six, so they read none of these.
 */
function withBaseScales(lists: PaletteLists, darkMode: boolean): PaletteLists {
  if (SCALE_PALETTES.every((p) => own(lists, p))) return lists;
  const inverted = (p: 'cScale' | 'git') =>
    lists[p] && { [`${p}Inv`]: lists[p].map((_, i) => `invert(${p}${i})`) };
  return { ...baseScalesFor(darkMode), ...inverted('cScale'), ...inverted('git'), ...lists };
}

/**
 * The palette overrides of one render, checked: a whole list (`borderColorArray`, `cScale`, …)
 * is an array or a comma-separated string; `cScale0`–`cScale11`, `cScaleInv<n>`,
 * `cScaleLabel<n>`, `git0`–`git7`, `gitInv<n>` and `gitBranchLabel<n>` replace one entry. Any
 * unsafe colour drops that override with a warning. The theme's own entries are evaluated when a
 * renderer reads the palette.
 */
function paletteSource(
  spec: ThemeSpec,
  vars: Readonly<Record<string, unknown>> | undefined,
  warn: ThemeOptions['warn'],
  /** The author's `themeVariables.darkMode`, not the theme's `dark` flag. */
  darkMode: boolean,
  /** The diagram table's `palette` variables, which the author lists as palettes (D545). */
  tablePalettes: readonly string[] = []
): PaletteSource {
  const drop = (name: string, raw: unknown) =>
    warn?.({
      code: 'THEME_VARIABLE_DROPPED',
      message: `themeVariables.${name} value ${JSON.stringify(String(raw).slice(0, 60))} is not allowed and was dropped.`,
    });
  // A theme that leaves the chart series palette out reads v12 theme-base's (D545).
  const lists = withBaseScales(
    {
      plotColorArray: BASE_PLOT,
      ...spec.palettes,
      ...(darkMode ? spec.darkModePalettes : undefined),
    },
    darkMode
  );
  const user: Partial<Record<string, readonly SafeColor[]>> = {};
  const slots = new Map<string, SafeColor>();
  if (!vars) return { spec: lists, user, slots };
  for (const name of [...PALETTE_VARIABLES, ...tablePalettes]) {
    const raw = own(vars, name) ? vars[name] : undefined;
    if (raw === undefined || raw === null) continue;
    const checked = paletteItems(raw)?.map((c) =>
      typeof c === 'string' ? checkColor(c) : undefined
    );
    if (!checked || checked.length > MAX_PALETTE || checked.includes(undefined)) {
      drop(name, raw);
      continue;
    }
    // An empty chart palette is unset, as an empty value is: a reader cycles through it (D545).
    if (checked.length || (name !== 'plotColorArray' && !tablePalettes.includes(name)))
      user[name] = checked as SafeColor[];
  }
  for (const [key, c] of numberedOverrides(vars, drop)) {
    // An entry the palette has no slot for is accepted and ignored (R-CONF-5).
    const m = RE_SLOT.exec(key) as RegExpExecArray;
    const p = m[1]!;
    if (Number(m[2]) < (user[p] ?? lists[p] ?? []).length) slots.set(key, c);
  }
  return { spec: lists, user, slots };
}

/** Builds one render's theme. */
interface ThemeParts {
  darkMode: boolean;
  main: Resolver;
  night: Resolver | undefined;
  /** Each palette read so far, as literal colours. */
  palettes: Map<string, readonly SafeColor[]>;
  /** `defs` as a map, for the lookups every themed value makes. */
  byName: ReadonlyMap<string, ThemeVarEntry>;
  /** `rootStyleText()` by the aliases used, in the order they were first used. */
  rootTexts: Map<string, StyleText>;
  /** Each padding variable read so far: a multiple of the diagram's padding, or px. */
  paddings: Map<string, { readonly scale: boolean; readonly n: number }>;
}

/** Literal values and tokens from a diagram table's family entries. */
type Literals = Readonly<Record<string, string | number | boolean>>;

/**
 * The family entries of `table` that apply under `spec` (D331): the fallback chain from the
 * deepest fallback up to the spec's own family, each level's dark entries over its own when the
 * spec is a dark theme (its trait, not the author's `darkMode`, as for a spec's own values).
 */
function familyEntries(
  table: DiagramThemeTable | undefined,
  spec: ThemeSpec
): { rules: ThemeRuleTable; lits: Literals } {
  const chain: DiagramThemeFamily[] = [];
  for (let f: ThemeFamily | undefined = spec.family; f; ) {
    const e: DiagramThemeFamily | undefined = table?.families?.[f];
    if (!e || chain.includes(e)) break;
    chain.unshift(e);
    f = e.fallback;
  }
  const rules: Record<string, string> = {};
  const lits: Record<string, string | number | boolean> = {};
  for (const e of chain)
    for (const x of [e, spec.dark ? e.dark : undefined]) {
      Object.assign(rules, x?.rules);
      Object.assign(lits, x?.values, x?.tokens);
    }
  return { rules, lits };
}

/** An author's value that sets nothing: absent, empty, or an empty list (D545). */
const unset = (v: unknown): boolean =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/**
 * `themeVariables` with the table's nested section (`themeVariables.packet.startByteColor`)
 * mapped onto its flat names key by key (D335, D540). A flat name the author set wins; one
 * {@link unset} leaves the nested key to apply.
 */
function flatten(
  tv: Readonly<Record<string, unknown>> | undefined,
  table: DiagramThemeTable | undefined
): Readonly<Record<string, unknown>> | undefined {
  const sec = table?.section !== undefined ? tv?.[table.section] : undefined;
  if (!tv || typeof sec !== 'object' || sec === null) return tv;
  const out: Record<string, unknown> = { ...tv };
  for (const [name, { nested: key }] of Object.entries(table!.vars))
    if (key !== undefined && own(sec, key) && unset(out[name]))
      out[name] = (sec as Record<string, unknown>)[key];
  return out;
}

// Without overrides a theme derives the same values on every render, so its resolvers (and
// their memos) are kept, keyed by the spec, the `auto` dark spec, the diagram's table and the
// registered fragment rules (D336). A render's own state is only `used`.
type Cache = WeakMap<object, Cache | ThemeParts>;
const PLAIN: Cache = new WeakMap();
const NONE = {};

function themeParts(spec: ThemeSpec, options: ThemeOptions): ThemeParts {
  const table = options.diagram;
  const tv = flatten(options.themeVariables, table);
  const plain = tv === undefined || Object.keys(tv).length === 0;
  const keys: object[] = [spec, options.dark ?? NONE, table ?? NONE, options.rules ?? NONE];
  let level: Cache = PLAIN;
  if (plain) {
    for (const k of keys.slice(0, -1)) {
      let next = level.get(k) as Cache | undefined;
      if (!next) level.set(k, (next = new WeakMap()));
      level = next;
    }
    const hit = level.get(keys[3]!) as ThemeParts | undefined;
    if (hit) return hit;
  }
  const defs: Record<string, ThemeVarEntry> = { ...THEME_VARIABLE_TABLE };
  // A fragment's rule for a name the diagram's own table defines loses to the table (D337). A
  // table var that shadows a core name is ignored, so it takes no fragment rule away either.
  const fragment: Record<string, string> = {};
  for (const [name, r] of Object.entries(options.rules ?? {})) {
    if (table && own(table.vars, name) && !own(THEME_VARIABLE_TABLE, name)) continue;
    fragment[name] = r;
    if (!own(defs, name)) defs[name] = { alias: name, kind: 'color' };
  }
  for (const [name, v] of Object.entries(table?.vars ?? {}))
    if (!own(THEME_VARIABLE_TABLE, name)) defs[name] = v;
  const overrides = checkOverrides(tv, defs, options.warn);
  const tablePalettes = Object.keys(defs).filter((name) => defs[name]!.kind === 'palette');
  const authorDark = tv?.darkMode === true || tv?.darkMode === 'true';
  const darkMode = spec.dark || authorDark;
  // The layers of today's precedence (spec #414): shared and diagram light/dark rules, the
  // theme's rules, the diagram's family rules, then the fragments'. Values beat every rule.
  const resolver = (s: ThemeSpec, dark: boolean, palettes?: PaletteSource): Resolver => {
    const fam = familyEntries(table, s);
    const rules: ThemeRuleTable = {
      ...(dark ? DARK_RULES : LIGHT_RULES),
      ...table?.rules.light,
      ...(dark ? table?.rules.dark : undefined),
      ...s.rules,
      ...fam.rules,
      ...fragment,
    };
    const written = new Set([...Object.keys(s.rules ?? {}), ...Object.keys(fam.rules)]);
    return new Resolver(s, rules, { lits: fam.lits, rules: written }, overrides, defs, palettes);
  };
  const parts: ThemeParts = {
    darkMode,
    main: resolver(
      spec,
      darkMode,
      paletteSource(spec, tv, options.warn, authorDark, tablePalettes)
    ),
    // The dark spec's own palettes, so a series slot read follows it there (D332).
    night: options.dark
      ? resolver(
          options.dark,
          true,
          paletteSource(options.dark, tv, undefined, authorDark, tablePalettes)
        )
      : undefined,
    palettes: new Map(),
    byName: new Map(Object.entries(defs)),
    rootTexts: new Map(),
    paddings: new Map(),
  };
  if (plain) level.set(keys[3]!, parts);
  return parts;
}

export function createTheme(spec: ThemeSpec, options: ThemeOptions = {}): Theme {
  const { byName, darkMode, main, night, palettes, rootTexts, paddings } = themeParts(
    spec,
    options
  );
  const vars = options.cssVariables !== false;
  const used = new Set<string>();
  // null: off. Built on first use, so the id prefix is only read when the gradient is on.
  let grad: ThemeGradient | null | undefined;
  const gradient = (): ThemeGradient | undefined => {
    if (grad === undefined) {
      if (main.get('useGradient').lit !== 'true') grad = null;
      else {
        // A stop is written on the gradient itself, after the root style: the public
        // variable over the computed value, not an alias.
        const stop = (name: string): StopColor => {
          const lit = main.get(name).lit;
          return (vars ? `var(--mermaid-${name},${lit})` : lit) as StopColor;
        };
        grad = {
          id: `${styleScope(options.idPrefix?.() ?? 'mermaid')}-gradient`,
          start: stop('gradientStart'),
          stop: stop('gradientStop'),
        };
      }
    }
    return grad ?? undefined;
  };

  const def = (name: string): ThemeVarEntry => {
    const d = byName.get(name);
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

  const theme: Theme = {
    name: spec.name,
    dark: darkMode,
    cssVariables: vars,
    color(name) {
      if (def(name).kind !== 'color') throw new TypeError(`${name} is not a colour`);
      return vars ? ref(name) : (main.get(name).lit as SafeColor);
    },
    outline(name) {
      const g = gradient();
      return g ? (`url(#${g.id})` as GradientRef) : theme.color(name);
    },
    gradient,
    length(name) {
      if (def(name).kind !== 'length') throw new TypeError(`${name} is not a length`);
      return vars ? ref(name) : Number(main.get(name).lit);
    },
    number(name) {
      const kind = def(name).kind;
      if (kind !== 'length' && kind !== 'padding' && kind !== 'opacity')
        throw new TypeError(`${name} is not a length`);
      return Number(main.get(name).lit);
    },
    padding(name, padding) {
      let p = paddings.get(name);
      if (!p) {
        if (def(name).kind !== 'padding') throw new TypeError(`${name} is not a padding`);
        const lit = main.get(name).lit;
        const m = RE_PADDING.exec(lit);
        p = m ? { scale: true, n: Number(m[1] ?? 1) } : { scale: false, n: Number(lit) };
        paddings.set(name, p);
      }
      return p.scale ? p.n * padding : p.n;
    },
    font(name = 'fontFamily') {
      return vars ? ref(name) : (main.get(name).lit as SafeValue);
    },
    filter(name) {
      if (def(name).kind !== 'filter') throw new TypeError(`${name} is not a filter`);
      return vars ? ref(name) : (main.get(name).lit as SafeFilter);
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
    rootStyleText() {
      if (!vars) return '' as StyleText;
      const key = [...used].join(',');
      let text = rootTexts.get(key);
      if (text === undefined) {
        text = styleText(decls(main, used, night ? false : undefined));
        rootTexts.set(key, text);
      }
      return text;
    },
    autoDeclarations: () =>
      vars && night
        ? { light: decls(main, used, true), dark: decls(night, used, true) }
        : undefined,
    paletteRgba: (name) => main.palette(name, true),
    palette(name) {
      let list = palettes.get(name);
      if (!list) palettes.set(name, (list = main.palette(name)));
      return list;
    },
  };
  return theme;
}
