/**
 * Types shared by the SVG writer, its two backings and the safety checks.
 *
 * Tag and attribute names are compile-time unions taken from the allow-list in
 * `allowlist.ts`. Values that could carry script or load a resource (URLs, colours,
 * lengths, style text, path data, transforms) are branded strings that only the
 * constructors in this module can produce.
 */

declare const brand: unique symbol;

/** A string that only a checked constructor in `core/svg` can produce. */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

/** A link or image URL that passed `checkUrl()`. */
export type SafeUrl = Brand<string, 'SafeUrl'>;
/** A colour that passed the colour allow-list (`checkColor()` / `checkStyle()`). */
export type SafeColor = Brand<string, 'SafeColor'>;
/** A length that passed the length allow-list, or one built from a number by `px()`. */
export type SafeLength = Brand<string, 'SafeLength'>;
/** A reference to a theme CSS variable, `var(--name)` or `var(--name,fallback)`. */
export type ThemeRef = Brand<string, 'ThemeRef'>;
/** A path `d` value built by `PathBuilder`. */
export type PathData = Brand<string, 'PathData'>;
/** A `transform` value built by `translate()`, `rotate()`, `scale()`. */
export type Transform = Brand<string, 'Transform'>;
/** A `style` attribute value built by `styleText()`. */
export type StyleText = Brand<string, 'StyleText'>;
/** A `theme: 'auto'` style sheet built by `themeStyleSheet()` (R-THEME-8). */
export type ThemeStyleSheet = Brand<string, 'ThemeStyleSheet'>;
/** A CSS `filter` value that passed `checkFilter()`: `none` or `drop-shadow(…)` only. */
export type SafeFilter = Brand<string, 'SafeFilter'>;
/** A free-form, plain value that passed a property validator (font-family, keywords). */
export type SafeValue = Brand<string, 'SafeValue'>;

/** The v12 link targets that are kept (D62). */
export type LinkTarget = '_self' | '_blank' | '_parent' | '_top';

/** A paint value: a checked colour, a theme variable, or a keyword. */
export type Paint = SafeColor | ThemeRef | 'none' | 'currentColor' | 'transparent';
/** A length: a plain number (user units), a checked length or a theme variable. */
export type Length = number | SafeLength | ThemeRef;

/** The attributes the writer can emit, with the value type each accepts. */
export interface AttrTypes {
  // document and structure
  xmlns: 'http://www.w3.org/2000/svg';
  viewBox: readonly [number, number, number, number];
  width: number | `${number}%`;
  height: number | `${number}%`;
  preserveAspectRatio: 'none' | 'xMidYMid meet' | 'xMinYMin meet';
  class: string;
  id: string;
  role: 'img' | 'graphics-document' | 'presentation';
  'aria-roledescription': string;
  'aria-labelledby': string;
  'aria-describedby': string;
  'aria-label': string;
  'aria-hidden': 'true' | 'false';
  'data-id': string;
  'data-ast': string;
  'data-mermaid-version': string;
  /** The render's id prefix, which a `theme: 'auto'` style sheet is scoped to. */
  'data-p': string;
  /** A palette slot, `color-<n>`, so tests and user CSS can target it (v12 `data-color-id`). */
  'data-color-id': `color-${number}`;
  style: StyleText;
  transform: Transform;
  'pointer-events': 'none' | 'all' | 'visiblePainted';
  // geometry
  x: number;
  y: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cx: number;
  cy: number;
  r: number;
  rx: number;
  ry: number;
  dx: number;
  dy: number;
  d: PathData;
  points: readonly number[];
  // presentation
  fill: Paint;
  'fill-opacity': number | SafeValue;
  stroke: Paint;
  'stroke-width': Length;
  'stroke-dasharray': SafeValue | 'none';
  'stroke-dashoffset': Length;
  'stroke-linecap': 'butt' | 'round' | 'square';
  'stroke-linejoin': 'miter' | 'round' | 'bevel';
  'stroke-miterlimit': number;
  'stroke-opacity': number | SafeValue;
  opacity: number | SafeValue;
  /** The theme's drop shadow (#85): a checked `drop-shadow(…)` list or a theme variable. */
  filter: SafeFilter | ThemeRef;
  color: Paint;
  'font-family': SafeValue | ThemeRef;
  'font-size': Length;
  'font-weight': SafeValue | ThemeRef | 'normal' | 'bold';
  'font-style': SafeValue | 'normal' | 'italic';
  'text-anchor': 'start' | 'middle' | 'end';
  'dominant-baseline': 'auto' | 'middle' | 'central' | 'hanging' | 'alphabetic';
  'text-decoration': SafeValue | 'underline' | 'line-through' | 'none';
  'letter-spacing': Length;
  'xml:space': 'preserve';
  // links and images
  href: SafeUrl;
  target: LinkTarget;
  rel: 'noopener noreferrer';
}

export type AllowedAttr = keyof AttrTypes;

/** Attributes for one element. `undefined` values are skipped. */
export type Attrs = { readonly [K in AllowedAttr]?: AttrTypes[K] | undefined };

export type AllowedTag =
  | 'svg'
  | 'g'
  | 'path'
  | 'rect'
  | 'circle'
  | 'ellipse'
  | 'polygon'
  | 'polyline'
  | 'line'
  | 'text'
  | 'tspan'
  | 'a'
  | 'title'
  | 'desc'
  | 'image';

/** A warning raised by a safety check. The pipeline forwards these to `ctx.warn`. */
export interface SvgWarning {
  code:
    | 'URL_REFUSED'
    | 'LINK_TARGET_DROPPED'
    | 'SECURITY_LEVEL'
    | 'STYLE_PROPERTY_DROPPED'
    | 'STYLE_VALUE_DROPPED';
  message: string;
}

export type Warn = (warning: SvgWarning) => void;
