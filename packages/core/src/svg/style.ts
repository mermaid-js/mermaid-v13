/**
 * The style allow-list (R-SEC-3, DESIGN §10). `style`, `classDef` and `linkStyle`
 * declarations are checked per property and come out as presentation attributes; anything
 * else is dropped with a warning. Also the constructors for the branded colour, length and
 * theme-reference values.
 */
import { RE_INVALID_XML, num } from './escape.ts';
import type {
  Attrs,
  SafeColor,
  SafeLength,
  SafeValue,
  StyleText,
  ThemeRef,
  ThemeStyleSheet,
  Warn,
} from './types.ts';

/** Values containing any of these are dropped whatever the property. */
export const RE_UNSAFE_STYLE =
  /url\s*\(|expression\s*\(|javascript:|@import|image-set|\/\*|[<>{};\\]/i;

const RE_HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RE_NAMED = /^[a-z]{3,30}$/i;
const RE_COLOR_CHARS = /^[a-z0-9_#.,%()\s+\-/]+$/i;
const RE_FUNC_NAME = /[a-z-]*$/i;
const COLOR_FUNCS: ReadonlySet<string> = new Set([
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'color',
  'color-mix',
  'light-dark',
  'var',
]);
const RE_VAR_ARG = /^\s*--(?:mermaid-|_)[\w-]/;
const RE_LENGTH =
  /^-?(?:\d{1,10}(?:\.\d{1,10})?|\.\d{1,10})(?:px|em|rem|ex|ch|pt|pc|cm|mm|in|vw|vh|%)?$/i;
const RE_NUMBER = /^(?:\d{1,10}(?:\.\d{1,10})?|\.\d{1,10})%?$/;
const RE_FAMILY = /^[\p{L}\p{N}\s,'"_.-]{1,200}$/u;
const RE_CUSTOM_PROP = /^--[A-Za-z0-9_-]{1,64}$/;

const FONT_SIZES: ReadonlySet<string> = new Set([
  'xx-small',
  'x-small',
  'small',
  'medium',
  'large',
  'x-large',
  'xx-large',
  'smaller',
  'larger',
]);
const WEIGHTS: ReadonlySet<string> = new Set([
  'normal',
  'bold',
  'bolder',
  'lighter',
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
const DECORATIONS: ReadonlySet<string> = new Set(['none', 'underline', 'overline', 'line-through']);

/** A colour from user styles or theme variables, or undefined when it is not allowed. */
export function checkColor(value: string): SafeColor | undefined {
  const v = value.trim();
  if (v === '' || v.length > 200 || RE_UNSAFE_STYLE.test(v) || RE_INVALID_XML.test(v))
    return undefined;
  if (RE_HEX.test(v) || RE_NAMED.test(v)) return v as SafeColor;
  if (!RE_COLOR_CHARS.test(v)) return undefined;
  // Every `(` must open an allowed colour function, and `var()` may only name Mermaid variables.
  let depth = 0;
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    if (c === '(') {
      const name = (RE_FUNC_NAME.exec(v.slice(0, i).trimEnd()) as RegExpExecArray)[0].toLowerCase();
      if (!COLOR_FUNCS.has(name)) return undefined;
      if (name === 'var' && !RE_VAR_ARG.test(v.slice(i + 1))) return undefined;
      if (++depth > 8) return undefined;
    } else if (c === ')') {
      if (--depth < 0) return undefined;
    }
  }
  return depth === 0 ? (v as SafeColor) : undefined;
}

/** A CSS length or plain number, or undefined when it is not one. */
export function checkLength(value: string): SafeLength | undefined {
  const v = value.trim();
  return RE_LENGTH.test(v) ? (v as SafeLength) : undefined;
}

/** A length in px built from a number. */
export function px(value: number): SafeLength {
  return (num(value) + 'px') as SafeLength;
}

/** A reference to a theme CSS variable, with an optional checked fallback. */
export function themeRef(
  name: string,
  fallback?: SafeColor | SafeLength | ThemeRef | number
): ThemeRef {
  if (!RE_CUSTOM_PROP.test(name))
    throw new TypeError(`${JSON.stringify(name)} is not a CSS custom property name`);
  if (fallback === undefined) return `var(${name})` as ThemeRef;
  return `var(${name},${typeof fallback === 'number' ? num(fallback) : fallback})` as ThemeRef;
}

type Kind =
  | 'color'
  | 'length'
  | 'opacity'
  | 'dash'
  | 'weight'
  | 'fontStyle'
  | 'family'
  | 'decoration'
  | 'cap'
  | 'join'
  | 'size'
  | 'spacing';
type Target = 'shape' | 'text' | 'both';

const PROPERTIES: Readonly<Record<string, readonly [Kind, Target]>> = {
  fill: ['color', 'shape'],
  stroke: ['color', 'shape'],
  'stroke-width': ['length', 'shape'],
  'stroke-dasharray': ['dash', 'shape'],
  'stroke-dashoffset': ['length', 'shape'],
  'stroke-opacity': ['opacity', 'shape'],
  'stroke-linecap': ['cap', 'shape'],
  'stroke-linejoin': ['join', 'shape'],
  'fill-opacity': ['opacity', 'shape'],
  opacity: ['opacity', 'both'],
  color: ['color', 'text'],
  'font-size': ['size', 'text'],
  'font-family': ['family', 'text'],
  'font-weight': ['weight', 'text'],
  'font-style': ['fontStyle', 'text'],
  'text-decoration': ['decoration', 'text'],
  'letter-spacing': ['spacing', 'text'],
};

/** The properties `checkStyle` keeps. */
export const STYLE_PROPERTIES: ReadonlySet<string> = new Set(Object.keys(PROPERTIES));

function checkValue(kind: Kind, v: string): string | undefined {
  const lower = v.toLowerCase();
  switch (kind) {
    case 'color':
      return checkColor(v);
    case 'length':
      return checkLength(v);
    case 'size':
      return FONT_SIZES.has(lower) ? lower : checkLength(v);
    case 'spacing':
      return lower === 'normal' ? lower : checkLength(v);
    case 'opacity':
      return RE_NUMBER.test(v) ? v : undefined;
    case 'dash': {
      if (lower === 'none') return lower;
      const parts = v.split(/[\s,]+/).filter((p) => p !== '');
      return parts.length > 0 && parts.length <= 32 && parts.every((p) => RE_LENGTH.test(p))
        ? parts.join(' ')
        : undefined;
    }
    case 'weight':
      return WEIGHTS.has(lower) ? lower : undefined;
    case 'fontStyle':
      return lower === 'normal' || lower === 'italic' || lower === 'oblique' ? lower : undefined;
    case 'family':
      return RE_FAMILY.test(v) ? v : undefined;
    case 'decoration': {
      const words = lower.split(/\s+/);
      return words.length <= 3 && words.every((w) => DECORATIONS.has(w))
        ? words.join(' ')
        : undefined;
    }
    case 'cap':
      return lower === 'butt' || lower === 'round' || lower === 'square' ? lower : undefined;
    case 'join':
      return lower === 'miter' || lower === 'round' || lower === 'bevel' ? lower : undefined;
  }
}

/** Checked style declarations, split by what they apply to, as presentation attributes. */
export interface CheckedStyle {
  /** For the shape or line: fill, stroke, stroke-*, opacity. */
  readonly shape: Attrs;
  /** For the label: `color` becomes `fill`, plus font-* and text-decoration. */
  readonly text: Attrs;
}

const EMPTY: CheckedStyle = Object.freeze({ shape: Object.freeze({}), text: Object.freeze({}) });

/**
 * Checks Mermaid style declarations (`['fill:#f9f', 'stroke-width:4px']`, as the parser
 * splits a `style`/`classDef`/`linkStyle` statement). Unknown properties and unsafe values
 * are dropped with a warning. Later declarations win.
 */
export function checkStyle(declarations: readonly string[], warn?: Warn): CheckedStyle {
  if (declarations.length === 0) return EMPTY;
  const shape: Record<string, string> = {};
  const text: Record<string, string> = {};
  let any = false;
  for (const decl of declarations) {
    const at = decl.indexOf(':');
    const prop = (at < 0 ? decl : decl.slice(0, at)).trim().toLowerCase();
    if (prop === '') continue;
    const entry = Object.prototype.hasOwnProperty.call(PROPERTIES, prop)
      ? PROPERTIES[prop]
      : undefined;
    if (entry === undefined || at < 0) {
      warn?.({
        code: 'STYLE_PROPERTY_DROPPED',
        message: `Style property ${JSON.stringify(prop.slice(0, 60))} is not supported and was dropped.`,
      });
      continue;
    }
    const raw = decl
      .slice(at + 1)
      .replace(/!important/gi, '')
      .trim();
    const value =
      raw === '' || RE_UNSAFE_STYLE.test(raw) || RE_INVALID_XML.test(raw)
        ? undefined
        : checkValue(entry[0], raw);
    if (value === undefined) {
      warn?.({
        code: 'STYLE_VALUE_DROPPED',
        message: `Value ${JSON.stringify(raw.slice(0, 60))} for ${prop} is not allowed and was dropped.`,
      });
      continue;
    }
    any = true;
    const target = entry[1];
    if (target !== 'text') shape[prop] = value;
    if (target !== 'shape') text[prop === 'color' ? 'fill' : prop] = value;
  }
  return any ? { shape: shape as Attrs, text: text as Attrs } : EMPTY;
}

/** Properties a `style` attribute built by `styleText` may set, besides custom properties. */
export const STYLE_TEXT_PROPERTIES: ReadonlySet<string> = new Set([
  ...STYLE_PROPERTIES,
  'max-width',
  'width',
  'height',
]);

/**
 * A `style` attribute value from checked parts, for the few places that need one (the root
 * element's `max-width` and theme aliases, DESIGN §7.2).
 */
export function styleText(
  declarations: Readonly<Record<string, SafeColor | SafeLength | SafeValue | ThemeRef | number>>
): StyleText {
  let out = '';
  for (const prop in declarations) {
    const value = declarations[prop];
    if (value === undefined) continue;
    if (!RE_CUSTOM_PROP.test(prop) && !STYLE_TEXT_PROPERTIES.has(prop)) {
      throw new TypeError(`${JSON.stringify(prop)} is not an allowed style property`);
    }
    const text = typeof value === 'number' ? num(value) : value;
    if (RE_UNSAFE_STYLE.test(text) || RE_INVALID_XML.test(text))
      throw new TypeError(`Unsafe style value for ${prop}`);
    out += (out === '' ? '' : ';') + prop + ':' + text;
  }
  return out as StyleText;
}

const RE_SCOPE = /^[A-Za-z_][\w-]{0,63}$/;
const MEDIA_DARK = '@media (prefers-color-scheme:dark){';

function sheetBlock(scope: string, decls: Readonly<Record<string, ThemeRef>>): string {
  let body = '';
  for (const prop in decls) {
    const value = decls[prop as keyof typeof decls];
    if (!RE_CUSTOM_PROP.test(prop) || typeof value !== 'string' || !safeSheetValue(value))
      throw new TypeError(`${JSON.stringify(prop)} cannot go in a theme style sheet`);
    body += (body === '' ? '' : ';') + prop + ':' + value;
  }
  return `svg[data-p=${scope}]{${body}}`;
}

function safeSheetValue(value: string): boolean {
  return (
    value.trim() !== '' &&
    !RE_UNSAFE_STYLE.test(value) &&
    !RE_INVALID_XML.test(value) &&
    !/["'&]/.test(value)
  );
}

/**
 * The only `<style>` content the writer emits (R-THEME-8, DESIGN §8.1 item 6): custom
 * property declarations scoped to `svg[data-p=<scope>]`, once for light and once under
 * `prefers-color-scheme: dark`.
 */
export function themeStyleSheet(
  scope: string,
  light: Readonly<Record<string, ThemeRef>>,
  dark: Readonly<Record<string, ThemeRef>>
): ThemeStyleSheet {
  if (!RE_SCOPE.test(scope)) throw new TypeError(`${JSON.stringify(scope)} is not a style scope`);
  return (sheetBlock(scope, light) + MEDIA_DARK + sheetBlock(scope, dark) + '}') as ThemeStyleSheet;
}

const RE_BLOCK_HEAD = /^svg\[data-p=[A-Za-z_][\w-]{0,63}\]\{/;

/** Why `css` is not a sheet `themeStyleSheet` could have built, or undefined when it is. */
export function styleSheetProblem(css: string): string | undefined {
  let rest = css;
  const block = (): string | undefined => {
    const head = RE_BLOCK_HEAD.exec(rest);
    if (!head) return 'a style rule that is not svg[data-p=…]';
    const end = rest.indexOf('}');
    if (end === -1) return 'an unclosed style rule';
    const body = rest.slice(head[0].length, end);
    rest = rest.slice(end + 1);
    if (body.includes('{')) return 'a nested style rule';
    if (body === '') return undefined;
    for (const decl of body.split(';')) {
      const at = decl.indexOf(':');
      if (at < 0 || !RE_CUSTOM_PROP.test(decl.slice(0, at)) || !safeSheetValue(decl.slice(at + 1)))
        return `style declaration ${JSON.stringify(decl.slice(0, 40))}`;
    }
    return undefined;
  };
  const first = block();
  if (first) return first;
  if (!rest.startsWith(MEDIA_DARK)) return 'a style sheet without the dark-scheme rule';
  rest = rest.slice(MEDIA_DARK.length);
  const second = block();
  if (second) return second;
  return rest === '}' ? undefined : 'extra style sheet content';
}
