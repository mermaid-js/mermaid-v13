/**
 * The attribute rules of the output allow-list check (R-SEC-2): what an attribute's value may
 * be, as a table from the attribute's name to its rule. `inert.ts` scans the markup and calls
 * `attrProblem` for each attribute it reads.
 *
 * Split from `inert.ts`, which follows Pele's test oracle (https://github.com/obsidianmd/pele,
 * MIT, (c) 2026 kepano), tests/support/inert.ts at commit 3a2f075.
 */
import {
  ALLOWED_ATTRS,
  BLANK_REL,
  HREF_TAGS,
  LINK_TARGETS,
  NUMERIC_ATTRS,
  SVG_NS,
} from './allowlist.ts';
import type { InertOptions } from './inert.ts';
import {
  BLEND,
  BLEND_MODES,
  RE_UNSAFE_STYLE,
  STYLE_TEXT_PROPERTIES,
  checkFilter,
} from './style.ts';
import { isImageDataUrl } from './url.ts';

const RE_NUMBER = /^-?\d{1,15}(?:\.\d{1,15})?(?:e[-+]?\d{1,3})?$/;
const RE_PERCENT = /^\d{1,15}(?:\.\d{1,15})?%$/;
const RE_NUMBER_LIST = /^[\d\s,.eE+-]*$/;
// cspell:disable-next-line
const RE_PATH = /^[MLHVCSQTAZmlhvcsqtaz\d\s,.eE+-]*$/;
const RE_ALIAS_REF = /^var\(--_[A-Za-z0-9_-]{1,64}\)$/;
// A palette slot as `AllowedAttr['data-color-id']` types it, `color-<n>`.
const RE_COLOR_ID = /^color-\d{1,3}$/;
const RE_TRANSFORM_CHARS = /^[a-zA-Z(),.\d\s+-]*$/;
const TRANSFORMS: ReadonlySet<string> = new Set([
  'translate',
  'rotate',
  'scale',
  'matrix',
  'skewX',
  'skewY',
  'e',
]);
const RE_WORD = /[a-zA-Z]+/g;
const RE_SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;
const RE_NETWORK_PATH = /^[\\/]{2}/;
const RE_ENTITY = /^&(?:amp|lt|gt|quot|apos|#\d{1,8}|#x[0-9a-fA-F]{1,8});/;
const FILL_RULES: ReadonlySet<string> = new Set(['nonzero', 'evenodd']);
const PAINT_LIKE: ReadonlySet<string> = new Set([
  'fill',
  'stroke',
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-decoration',
  'letter-spacing',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'stroke-width',
  'stroke-dasharray',
  'stroke-dashoffset',
]);

export function decodeAttr(value: string): string {
  if (!value.includes('&')) return value;
  return value
    .replace(/&#x([0-9a-fA-F]{1,8});/g, (_m, hex: string) =>
      String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff))
    )
    .replace(/&#(\d{1,8});/g, (_m, dec: string) =>
      String.fromCodePoint(Math.min(Number(dec), 0x10ffff))
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// Every `&` must start a well-formed reference.
export function badAmp(text: string): boolean {
  for (let i = text.indexOf('&'); i !== -1; i = text.indexOf('&', i + 1)) {
    if (!RE_ENTITY.test(text.slice(i, i + 12))) return true;
  }
  return false;
}

function decodePercent(uri: string): string {
  try {
    return decodeURIComponent(uri);
  } catch {
    return uri;
  }
}

// What a browser makes of an href: tabs and line breaks dropped, then leading spaces and controls.
// eslint-disable-next-line no-control-regex -- C0 controls are what browsers strip
const RE_LEADING_CTRL = /^[\u0000- ]+/;
function browserView(value: string): string {
  return value.replace(/[\t\n\r]/g, '').replace(RE_LEADING_CTRL, '');
}

function hrefProblem(tag: string, value: string, options: InertOptions): string | undefined {
  const strict = options.securityLevel === 'strict';
  const image = tag === 'image';
  const seen = browserView(value);
  // An image source follows checkImageUrl: raster data URLs, and no mail or link schemes.
  if (image && isImageDataUrl(seen) && isImageDataUrl(decodePercent(seen))) return undefined;
  let schemes: readonly string[] = options.linkSchemes ?? ['http', 'https', 'mailto'];
  if (strict) schemes = [];
  else if (image) schemes = ['http', 'https'];
  for (const form of [seen, browserView(decodePercent(seen))]) {
    if (RE_NETWORK_PATH.test(form)) return `href="${value}" is a network path`;
    const scheme = RE_SCHEME.exec(form);
    if (scheme && !schemes.includes((scheme[1] as string).toLowerCase()))
      return `href="${value}" has a scheme that is not allowed`;
  }
  return undefined;
}

/** Why a value is not allowed for an attribute of this name on this tag, or undefined. */
type AttrRule = (
  tag: string,
  name: string,
  value: string,
  options: InertOptions
) => string | undefined;

const shown = (name: string, value: string): string => `${name}="${value}"`;

/** The value must match `re`. */
const matching =
  (re: RegExp): AttrRule =>
  (_tag, name, value) =>
    re.test(value) ? undefined : shown(name, value);

/** The value must be one of `set`. */
const among =
  (set: ReadonlySet<string>): AttrRule =>
  (_tag, name, value) =>
    set.has(value) ? undefined : shown(name, value);

const sizeRule: AttrRule = (_tag, name, value) =>
  RE_NUMBER.test(value) || RE_PERCENT.test(value) ? undefined : `${name}="${value}" is not a size`;

const xmlnsRule: AttrRule = (tag, _name, value) =>
  tag === 'svg' && value === SVG_NS ? undefined : `xmlns="${value}" on <${tag}>`;

const hrefRule: AttrRule = (tag, _name, value, options) =>
  HREF_TAGS.has(tag) ? hrefProblem(tag, value, options) : `href on <${tag}>`;

const relRule: AttrRule = (_tag, _name, value) =>
  value === BLANK_REL ? undefined : `rel="${value}"`;

const transformRule: AttrRule = (_tag, name, value) => {
  if (!RE_TRANSFORM_CHARS.test(value)) return shown(name, value);
  for (const word of value.match(RE_WORD) ?? [])
    if (!TRANSFORMS.has(word)) return shown(name, value);
  return undefined;
};

// A theme alias, or a drop-shadow list: never url(), which could load or reference.
const filterRule: AttrRule = (_tag, name, value) =>
  RE_ALIAS_REF.test(value) || checkFilter(value) !== undefined ? undefined : shown(name, value);

const styleRule: AttrRule = (_tag, name, value) => {
  for (const decl of value.split(';')) {
    if (decl.trim() === '') continue;
    const at = decl.indexOf(':');
    const prop = (at < 0 ? decl : decl.slice(0, at)).trim();
    if (at < 0 || (!prop.startsWith('--') && !STYLE_TEXT_PROPERTIES.has(prop)))
      return `style property ${prop}`;
    const v = decl.slice(at + 1);
    if (RE_UNSAFE_STYLE.test(v) || (prop === BLEND && !BLEND_MODES.has(v.trim())))
      return shown(name, value);
  }
  return undefined;
};

const ATTR_RULES: ReadonlyMap<string, AttrRule> = new Map<string, AttrRule>([
  ['width', sizeRule],
  ['height', sizeRule],
  ['xmlns', xmlnsRule],
  ['href', hrefRule],
  ['target', among(LINK_TARGETS)],
  ['rel', relRule],
  ['d', matching(RE_PATH)],
  ['points', matching(RE_NUMBER_LIST)],
  ['viewBox', matching(RE_NUMBER_LIST)],
  ['transform', transformRule],
  ['fill-rule', among(FILL_RULES)],
  ['clip-rule', among(FILL_RULES)],
  ['data-color-id', matching(RE_COLOR_ID)],
  ['filter', filterRule],
  ['style', styleRule],
]);

export function attrProblem(
  tag: string,
  name: string,
  value: string,
  options: InertOptions
): string | undefined {
  if (!ALLOWED_ATTRS.has(name)) return `attribute ${name} on <${tag}>`;
  if (NUMERIC_ATTRS.has(name))
    return RE_NUMBER.test(value) ? undefined : `${name}="${value}" is not a number`;
  const rule = ATTR_RULES.get(name);
  if (rule !== undefined) return rule(tag, name, value, options);
  if (PAINT_LIKE.has(name) && RE_UNSAFE_STYLE.test(value)) return shown(name, value);
  return undefined;
}
