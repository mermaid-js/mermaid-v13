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
  GRADIENT_ATTRS,
  GRADIENT_FIXED,
  GRADIENT_TAGS,
  HREF_TAGS,
  LINK_TARGETS,
  NUMERIC_ATTRS,
  RE_GRADIENT_ID,
  RE_USER_GRADIENT_ID,
  SVG_NS,
} from './allowlist.ts';
import { RE_INVALID_XML } from './escape.ts';
import {
  BLEND,
  BLEND_MODES,
  RE_UNSAFE_STYLE,
  STYLE_TEXT_PROPERTIES,
  checkColor,
  checkFilter,
  styleSheetProblem,
} from './style.ts';
import { isImageDataUrl, type SecurityLevel } from './url.ts';

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
  /**
   * The render's gradient (D182): its id, or `false` when the render has none, so no such
   * gradient is accepted. Left out, the id is the one the document's gradient declares, which
   * must look like `<scope>-gradient`.
   */
  readonly gradient?: string | false;
  /**
   * The render's style scope: every user-space gradient (D391) must be `<scope>-g-<hash>`. Left
   * out, it is the render's gradient's (`<scope>-gradient`, given or found first), else the
   * first user-space gradient's, and the others must share it. The pipeline always gives it.
   */
  readonly scope?: string;
}

/**
 * Where the scan is in the `<defs>` an SVG may carry: at most one render's gradient (D182) and
 * any number of user-space gradients (D391), each with two stops.
 */
interface GradientScan {
  /** The render's gradient's id, given or found. */
  id: string | undefined;
  /** The user-space gradients' scope, given or found. */
  scope: string | undefined;
  /** Elements the root has had so far. */
  rootChildren: number;
  defs: number;
  /** Render's gradients (D182) so far. */
  box: number;
  /** Every gradient id the document has declared. */
  ids: Set<string>;
  /** The current `<linearGradient>`'s attributes, kind and stops. */
  attrs: Record<string, string>;
  user: boolean;
  stops: number;
}

const RE_FRACTION = /^(?:0|1|0?\.\d{1,6})$/;
const RE_PERCENT_STOP = /^(?:\d{1,2}(?:\.\d{1,6})?|100)%$/;

/** Why element `tag` cannot stand under `parent` here, as far as the gradient goes. */
function gradientPlace(
  tag: string,
  stack: readonly string[],
  base: number,
  g: GradientScan
): string | undefined {
  const parent = stack[stack.length - 1];
  const depth = stack.length - base;
  if (depth === 1) g.rootChildren++;
  switch (tag) {
    case 'defs':
      if (depth !== 1 || parent !== 'svg' || g.rootChildren !== 1 || ++g.defs > 1)
        return '<defs> that is not the first child of <svg>';
      return undefined;
    case 'linearGradient':
      if (parent !== 'defs') return '<linearGradient> out of place';
      g.attrs = {};
      g.stops = 0;
      return undefined;
    case 'stop':
      return parent === 'linearGradient' && ++g.stops <= 2 ? undefined : '<stop> out of place';
  }
  return parent !== undefined && GRADIENT_TAGS.has(parent) ? `<${tag}> in <${parent}>` : undefined;
}

/** Why an attribute of the gradient's elements, or one only they take, is not allowed. */
function gradientAttrProblem(
  tag: string,
  name: string,
  value: string,
  g: GradientScan
): string | undefined {
  const owner = GRADIENT_ATTRS.get(name);
  if (owner !== undefined && owner !== tag) return `${name} on <${tag}>`;
  if (tag === 'linearGradient') {
    // Checked as a whole at the end of the start tag (gradientShape).
    g.attrs[name] = value;
    return undefined;
  }
  if (tag === 'stop') {
    if (name === 'offset')
      return RE_FRACTION.test(value) || RE_PERCENT_STOP.test(value)
        ? undefined
        : `offset="${value}"`;
    if (name === 'stop-color') return checkColor(value) ? undefined : `stop-color="${value}"`;
    if (name === 'stop-opacity')
      return !g.user && RE_FRACTION.test(value) ? undefined : `stop-opacity="${value}"`;
    return `${name} on <stop>`;
  }
  if (tag === 'defs') return `${name} on <defs>`;
  if (name === 'id' && (value === g.id || g.ids.has(value))) return `id="${value}" is a gradient's`;
  return undefined;
}

/**
 * Why the `<linearGradient>` just started is neither the render's gradient (D182) nor a
 * user-space one (D391): `userSpaceOnUse`, `<scope>-g-<hash>`, numeric x1, x2 and y1 = y2.
 */
function gradientShape(g: GradientScan, options: InertOptions): string | undefined {
  const a = g.attrs;
  const id = a.id ?? '';
  const n = Object.keys(a).length;
  g.user = a.gradientUnits === 'userSpaceOnUse';
  if (g.user) {
    const scope = RE_USER_GRADIENT_ID.exec(id)?.[1];
    g.scope ??= scope;
    if (scope === undefined || scope !== g.scope) return `gradient id="${id}" is not this SVG's`;
    // attrProblem has checked each coordinate is a number.
    if (
      n !== 6 ||
      a.x1 === undefined ||
      a.x2 === undefined ||
      a.y1 === undefined ||
      a.y2 === undefined ||
      a.y1 !== a.y2
    )
      return `<linearGradient id="${id}"> that is not horizontal in user space`;
  } else {
    if (options.gradient === false) return '<defs> holds a gradient this render does not have';
    if (g.id === undefined && RE_GRADIENT_ID.test(id)) g.id = id;
    if (id !== g.id || ++g.box > 1) return `gradient id="${id}" is not this SVG's`;
    // The user-space gradients after it are in its scope.
    g.scope ??= id.slice(0, -9);
    if (n !== Object.keys(GRADIENT_FIXED).length + 1)
      return '<linearGradient> without its id, units and direction';
    for (const k in GRADIENT_FIXED)
      if (a[k] !== GRADIENT_FIXED[k]) return `${k}="${a[k]}" on <linearGradient>`;
  }
  if (g.ids.has(id)) return `a second gradient id="${id}"`;
  g.ids.add(id);
  return undefined;
}

/**
 * A `fill` or `stroke` that refers to a gradient: only `url(#<id>)`, after the gradient. Any
 * other `url(` (and `url(` anywhere else) is left to `attrProblem`, which rejects it.
 */
function gradientRef(name: string, value: string, g: GradientScan): boolean {
  return (
    (name === 'fill' || name === 'stroke') &&
    value.startsWith('url(#') &&
    value.endsWith(')') &&
    g.ids.has(value.slice(5, -1))
  );
}

const STYLE_OPEN = '<style>';
const STYLE_CLOSE = '</style>';

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
      return HREF_TAGS.has(tag) ? hrefProblem(tag, value, options) : `href on <${tag}>`;
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
    case 'fill-rule':
    case 'clip-rule':
      return value === 'nonzero' || value === 'evenodd' ? undefined : `${name}="${value}"`;
    case 'data-color-id':
      return RE_COLOR_ID.test(value) ? undefined : `data-color-id="${value}"`;
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
        const v = decl.slice(at + 1);
        if (RE_UNSAFE_STYLE.test(v) || (prop === BLEND && !BLEND_MODES.has(v.trim())))
          return `style="${value}"`;
      }
      return undefined;
    }
  }
  if (PAINT_LIKE.has(name) && RE_UNSAFE_STYLE.test(value)) return `${name}="${value}"`;
  return undefined;
}

/** One root `<svg>`'s scope: the outer root's, or an embedded diagram's (ADR-15). */
interface Scope {
  /** Where the root sits in the element stack. */
  readonly base: number;
  readonly options: InertOptions;
  readonly g: GradientScan;
  sheets: number;
}

function scopeOf(base: number, options: InertOptions): Scope {
  const g: GradientScan = {
    id: typeof options.gradient === 'string' ? options.gradient : undefined,
    scope:
      options.scope ??
      (typeof options.gradient === 'string' ? options.gradient.slice(0, -9) : undefined),
    rootChildren: 0,
    defs: 0,
    box: 0,
    ids: new Set(),
    attrs: {},
    user: false,
    stops: 0,
  };
  return { base, options, g, sheets: 0 };
}

/**
 * The first thing about the markup that is not inert, or undefined when there is none. A
 * nested `<svg>` (an embedded diagram, ADR-15) is checked as a root of its own: one `<style>`
 * and one `<defs>` directly under it, its own gradient scope.
 */
export function inertProblem(svg: string, options: InertOptions = {}): string | undefined {
  const bad = RE_INVALID_XML.exec(svg);
  if (bad) return `character U+${bad[0].charCodeAt(0).toString(16).toUpperCase()} at ${bad.index}`;
  const stack: string[] = [];
  let i = 0;
  const n = svg.length;
  // The outer root, then each embedded diagram's root (ADR-15) open around the scan: each has
  // its own style sheet, gradients and scope.
  const frames: Scope[] = [scopeOf(0, options)];
  let f = frames[0] as Scope;
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
      if (stack.length !== f.base + 1 || stack[f.base] !== 'svg')
        return '<style> that is not a child of <svg>';
      if (++f.sheets > 1) return 'a second <style>';
      f.g.rootChildren++;
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
      if (tag === 'linearGradient' && f.g.stops !== 2) return '<linearGradient> without two stops';
      if (tag === 'defs' && f.g.ids.size === 0) return '<defs> without a gradient';
      if (tag === 'svg' && frames.length > 1 && stack.length === f.base) {
        frames.pop();
        f = frames[frames.length - 1] as Scope;
      }
      continue;
    }
    const g = f.g;
    const place = gradientPlace(tag, stack, f.base, g);
    if (place !== undefined) return place;
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
      const problem =
        gradientAttrProblem(tag, name, value, g) ??
        (gradientRef(name, value, g) ? undefined : attrProblem(tag, name, value, options));
      if (problem !== undefined) return problem;
      if (name === 'target') target = value;
      if (name === 'rel') rel = value;
    }
    if (target === '_blank' && rel !== BLANK_REL)
      return `<${tag} target="_blank"> without rel="${BLANK_REL}"`;
    if (tag === 'linearGradient') {
      const shape = gradientShape(g, f.options);
      if (shape !== undefined) return shape;
    }
    if (selfClosing && (tag === 'defs' || tag === 'linearGradient')) return `an empty <${tag}>`;
    if (tag === 'stop' && !seen.has('offset')) return '<stop> without an offset';
    if (!selfClosing) {
      // A nested root opens an embedded diagram's scope.
      if (tag === 'svg' && stack.length > 0) {
        f = scopeOf(stack.length, { ...options, gradient: undefined, scope: undefined });
        frames.push(f);
      }
      stack.push(tag);
    }
  }
  if (stack.length > 0) return `unclosed <${stack[stack.length - 1]}>`;
  return undefined;
}

/** Throws when the markup is not inert. */
export function assertInert(svg: string, options?: InertOptions): void {
  const problem = inertProblem(svg, options);
  if (problem !== undefined) throw new Error(`SVG output is not inert: ${problem}`);
}
