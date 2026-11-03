/**
 * `assertInert`: the output allow-list check (R-SEC-2). Tests run it over every rendered
 * output, and the pipeline re-runs it after `postRender` hooks, so a hook cannot bring in
 * `<script>`, `on*`, `<style>`, `foreignObject` or a script-capable URL.
 *
 * A linear hand-written scanner: the input may be hostile, so no backtracking regexes.
 * Structure follows Pele's test oracle (https://github.com/obsidianmd/pele, MIT,
 * (c) 2026 kepano), tests/support/inert.ts @ 3a2f075.
 */
import {
  ALLOWED_ATTRS,
  ALLOWED_TAGS,
  BLANK_REL,
  HREF_TAGS,
  LINK_TARGETS,
  NUMERIC_ATTRS,
  SVG_NS,
} from './allowlist.ts';
import { RE_INVALID_XML } from './escape.ts';
import { RE_UNSAFE_STYLE, STYLE_TEXT_PROPERTIES, checkFilter, styleSheetProblem } from './style.ts';
import type { SecurityLevel } from './url.ts';

export interface InertOptions {
  readonly securityLevel?: SecurityLevel;
  /** The integrator's link schemes, when not the default http, https and mailto. */
  readonly linkSchemes?: readonly string[];
  /**
   * Accept one `<style>` directly under the root `<svg>` holding a `theme: 'auto'` sheet
   * (R-THEME-8): custom properties only, as `themeStyleSheet()` builds it. Any other
   * `<style>` is still rejected.
   */
  readonly themeStyle?: boolean;
}

const STYLE_OPEN = '<style>';
const STYLE_CLOSE = '</style>';

const RE_NUMBER = /^-?\d{1,15}(?:\.\d{1,15})?(?:e[-+]?\d{1,3})?$/;
const RE_PERCENT = /^\d{1,15}(?:\.\d{1,15})?%$/;
const RE_NUMBER_LIST = /^[\d\s,.eE+-]*$/;
// cspell:disable-next-line
const RE_PATH = /^[MLHVCSQTAZmlhvcsqtaz\d\s,.eE+-]*$/;
const RE_ALIAS_REF = /^var\(--_[A-Za-z0-9_-]{1,64}\)$/;
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

function decodeAttr(value: string): string {
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
function badAmp(text: string): boolean {
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
const RE_LEADING_CTRL = /^[\u0000-\u0020]+/;
function browserView(value: string): string {
  return value.replace(/[\t\n\r]/g, '').replace(RE_LEADING_CTRL, '');
}

function hrefProblem(value: string, options: InertOptions): string | undefined {
  const schemes =
    options.securityLevel === 'strict' ? [] : (options.linkSchemes ?? ['http', 'https', 'mailto']);
  const seen = browserView(value);
  for (const form of [seen, browserView(decodePercent(seen))]) {
    if (RE_NETWORK_PATH.test(form)) return `href="${value}" is a network path`;
    const scheme = RE_SCHEME.exec(form);
    if (scheme && !schemes.includes((scheme[1] as string).toLowerCase()))
      return `href="${value}" has a scheme that is not allowed`;
  }
  return undefined;
}

function attrProblem(
  tag: string,
  name: string,
  value: string,
  options: InertOptions
): string | undefined {
  if (!ALLOWED_ATTRS.has(name)) return `attribute ${name} on <${tag}>`;
  if (NUMERIC_ATTRS.has(name))
    return RE_NUMBER.test(value) ? undefined : `${name}="${value}" is not a number`;
  switch (name) {
    case 'width':
    case 'height':
      return RE_NUMBER.test(value) || RE_PERCENT.test(value)
        ? undefined
        : `${name}="${value}" is not a size`;
    case 'xmlns':
      return tag === 'svg' && value === SVG_NS ? undefined : `xmlns="${value}" on <${tag}>`;
    case 'href':
      return HREF_TAGS.has(tag) ? hrefProblem(value, options) : `href on <${tag}>`;
    case 'target':
      return LINK_TARGETS.has(value) ? undefined : `target="${value}"`;
    case 'rel':
      return value === BLANK_REL ? undefined : `rel="${value}"`;
    case 'd':
      return RE_PATH.test(value) ? undefined : `d="${value}"`;
    case 'points':
    case 'viewBox':
      return RE_NUMBER_LIST.test(value) ? undefined : `${name}="${value}"`;
    case 'transform': {
      if (!RE_TRANSFORM_CHARS.test(value)) return `transform="${value}"`;
      for (const word of value.match(RE_WORD) ?? [])
        if (!TRANSFORMS.has(word)) return `transform="${value}"`;
      return undefined;
    }
    case 'filter':
      // A theme alias, or a drop-shadow list: never url(), which could load or reference.
      return RE_ALIAS_REF.test(value) || checkFilter(value) !== undefined
        ? undefined
        : `filter="${value}"`;
    case 'style': {
      for (const decl of value.split(';')) {
        if (decl.trim() === '') continue;
        const at = decl.indexOf(':');
        const prop = (at < 0 ? decl : decl.slice(0, at)).trim();
        if (at < 0 || (!prop.startsWith('--') && !STYLE_TEXT_PROPERTIES.has(prop)))
          return `style property ${prop}`;
        if (RE_UNSAFE_STYLE.test(decl.slice(at + 1))) return `style="${value}"`;
      }
      return undefined;
    }
  }
  if (PAINT_LIKE.has(name) && RE_UNSAFE_STYLE.test(value)) return `${name}="${value}"`;
  return undefined;
}

/** The first thing about the markup that is not inert, or undefined when there is none. */
export function inertProblem(svg: string, options: InertOptions = {}): string | undefined {
  const bad = RE_INVALID_XML.exec(svg);
  if (bad) return `character U+${bad[0].charCodeAt(0).toString(16).toUpperCase()} at ${bad.index}`;
  const stack: string[] = [];
  let i = 0;
  const n = svg.length;
  let sheets = 0;
  while (i < n) {
    const lt = svg.indexOf('<', i);
    const text = svg.slice(i, lt === -1 ? n : lt);
    if (text.includes('>'))
      return `unescaped ">" in text near ${JSON.stringify(text.slice(0, 40))}`;
    if (badAmp(text)) return `unescaped "&" in text near ${JSON.stringify(text.slice(0, 40))}`;
    if (lt === -1) break;
    i = lt + 1;
    const closing = svg[i] === '/';
    if (closing) i++;
    const nameStart = i;
    while (i < n && /[\w:.-]/.test(svg[i] as string)) i++;
    const tag = svg.slice(nameStart, i);
    if (tag === '' || !/^[A-Za-z]/.test(tag))
      return `markup ${JSON.stringify(svg.slice(lt, lt + 20))}`;
    if (tag === 'style' && options.themeStyle && !closing) {
      if (svg.slice(lt, lt + STYLE_OPEN.length) !== STYLE_OPEN) return '<style> with attributes';
      if (stack.length !== 1 || stack[0] !== 'svg') return '<style> that is not a child of <svg>';
      if (++sheets > 1) return 'a second <style>';
      const end = svg.indexOf(STYLE_CLOSE, lt);
      if (end === -1) return 'unclosed <style>';
      const css = svg.slice(lt + STYLE_OPEN.length, end);
      if (css.includes('<') || css.includes('&')) return 'markup in <style>';
      const problem = styleSheetProblem(css);
      if (problem !== undefined) return `<style> holds ${problem}`;
      i = end + STYLE_CLOSE.length;
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) return `element <${tag}>`;
    if (closing) {
      while (i < n && /\s/.test(svg[i] as string)) i++;
      if (svg[i] !== '>') return `malformed </${tag}>`;
      i++;
      const open = stack.pop();
      if (open !== tag) return `</${tag}> closes <${open ?? 'nothing'}>`;
      continue;
    }
    const seen = new Set<string>();
    let target: string | undefined;
    let rel: string | undefined;
    let selfClosing = false;
    for (;;) {
      const before = i;
      while (i < n && /\s/.test(svg[i] as string)) i++;
      if (svg[i] === '>') {
        i++;
        break;
      }
      if (svg[i] === '/' && svg[i + 1] === '>') {
        i += 2;
        selfClosing = true;
        break;
      }
      if (i === before) return `malformed <${tag}>`;
      const attrStart = i;
      while (i < n && /[\w:.-]/.test(svg[i] as string)) i++;
      const name = svg.slice(attrStart, i);
      if (name === '' || svg[i] !== '=' || svg[i + 1] !== '"')
        return `malformed attribute on <${tag}>`;
      i += 2;
      const end = svg.indexOf('"', i);
      if (end === -1) return `unterminated attribute ${name} on <${tag}>`;
      const raw = svg.slice(i, end);
      i = end + 1;
      if (raw.includes('<')) return `"<" in attribute ${name} on <${tag}>`;
      if (badAmp(raw)) return `unescaped "&" in attribute ${name} on <${tag}>`;
      if (seen.has(name)) return `<${tag}> has ${name} twice`;
      seen.add(name);
      const value = decodeAttr(raw);
      const problem = attrProblem(tag, name, value, options);
      if (problem !== undefined) return problem;
      if (name === 'target') target = value;
      if (name === 'rel') rel = value;
    }
    if (target === '_blank' && rel !== BLANK_REL)
      return `<${tag} target="_blank"> without rel="${BLANK_REL}"`;
    if (!selfClosing) stack.push(tag);
  }
  if (stack.length > 0) return `unclosed <${stack[stack.length - 1]}>`;
  return undefined;
}

/** Throws when the markup is not inert. */
export function assertInert(svg: string, options?: InertOptions): void {
  const problem = inertProblem(svg, options);
  if (problem !== undefined) throw new Error(`SVG output is not inert: ${problem}`);
}
