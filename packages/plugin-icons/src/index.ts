/**
 * The icons extension plugin, `@mermaid-js/plugin-icons` (D290–D299): Iconify icon packs drawn
 * as allow-listed SVG nodes (D295).
 *
 * - In labels, `fa:fa-car` and the other D296 prefixes become an inline box (D177, D293) 1em
 *   tall at the label's font size, as wide as the icon's aspect makes it, its bottom 0.125em
 *   below the baseline (v12's `.label-icon`). Its `currentColor` fill takes the label's text
 *   colour.
 * - Outside labels (flowchart icon shapes, mindmap `::icon()`), `RenderContext.icon` gets the
 *   glyph fitted into the square the diagram asks for (xMidYMid meet). It keeps `currentColor`,
 *   which the diagram sets.
 *
 * The packs are the `mermaid` API object's (`registerIconPacks`, D294): this plugin reads them
 * through the request and keeps none. `resources.missing` reports each registered pack a parsed
 * diagram names that has not loaded, so `prepare()` runs only those loaders and a diagram
 * without icons runs none (D290). An icon that does not resolve is shown as written, with one
 * `ICON_NOT_RENDERED` per render naming the icons (D291); a pack still loading draws a
 * placeholder, an empty 1em box in labels and nothing in shapes (D299, with the API's
 * `PLACEHOLDER`); an icon the converter changed gives one `ICON_SIMPLIFIED` per render (D295).
 */
import type { ExtensionPlugin, GlyphRequest, IconPacks, ResourceRequest } from '@mermaid-js/core';
import type { ParseResult } from '@mermaid-js/core/parser-kit';
import type { Transform } from '@mermaid-js/core/svg';
import type { InlineBox, InlineProvider, InlineRequest, SvgFragment } from '@mermaid-js/core/text';
import { buildIcon, type BuiltIcon } from './icon.ts';
import { iconName } from './name.ts';
import { getIcon, type IconifyJSON } from './resolve.ts';

export type { IconifyAlias, IconifyIcon, IconifyJSON } from './resolve.ts';

/** D296: v12's label prefixes plus `fad`, with no left boundary; the pack, then the icon. */
// cspell:disable-next-line
const LABEL = /(fa[bdklrs]?):fa-([\w-]+)/;
const LABELS = new RegExp(LABEL.source, 'g');
/** How much of a name as written a warning quotes, as flowchart's `ICON_UNAVAILABLE` does. */
const QUOTE = 60;
/** How many icons a warning names. */
const LISTED = 8;

/** What a parsed diagram draws: label icons (`fa:fa-car`), glyph names, and their packs. */
interface Wanted {
  readonly labels: readonly string[];
  readonly glyphs: readonly string[];
  readonly packs: ReadonlySet<string>;
}

type Warn = GlyphRequest['warn'];
/** An icon ready to draw, a pack still loading that the API reported, or why it is not drawn. */
type Found = { readonly icon: BuiltIcon } | { readonly pending: true } | { readonly why: string };

/** Why a glyph name is not drawn when it splits into no pack and icon. */
const NOT_A_NAME = 'not a pack:name icon name';

/** Per parse (the API caches it with the analysis), so `renderSync` does not walk it again. */
const wantedByParse = new WeakMap<object, Wanted>();
/**
 * What the last `missing()` found, per API object's packs. The API asks `missing()` right before
 * it draws, synchronously, so while drawing this is the diagram being drawn: its packs that are
 * still `pending` were reported, and the API threw `NotLoadedError` or warned `PLACEHOLDER`.
 */
const wantedByPacks = new WeakMap<object, Wanted>();
/** Each pack's built icons, per pack object (a re-registered pack is a new object). */
const builtByPack = new WeakMap<object, Map<string, BuiltIcon | undefined>>();
/** Each built icon's nodes as a label draws them. */
const labelNodes = new WeakMap<BuiltIcon, readonly SvgFragment[]>();
/** What this render has warned, keyed by its warnings sink (one per render, shared by both). */
const warned = new WeakMap<Warn, { unresolved?: true; simplified?: true }>();

/** Every string in `value` (an AST or a model), for a diagram that lists no labels. */
function strings(value: unknown, out: string[]): void {
  const seen = new Set<object>();
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const v = stack.pop();
    if (typeof v === 'string') out.push(v);
    else if (typeof v === 'object' && v !== null && !seen.has(v)) {
      seen.add(v);
      if (v instanceof Map) for (const [k, x] of v) stack.push(k, x);
      else if (v instanceof Set) for (const x of v) stack.push(x);
      else for (const x of Object.values(v)) stack.push(x);
    }
  }
}

/** The icons a parsed diagram draws: in its labels (else any string it holds) and its shapes. */
function wantedOf(parse: ParseResult<unknown>, request: ResourceRequest): Wanted {
  let wanted = wantedByParse.get(parse);
  if (wanted) return wanted;
  let texts: readonly string[];
  if (request.labels) texts = request.labels();
  else {
    const all: string[] = [];
    strings(parse.ast, all);
    strings(parse.model, all);
    texts = all;
  }
  const labels: string[] = [];
  const packs = new Set<string>();
  for (const text of texts)
    for (const m of text.matchAll(LABELS)) {
      labels.push(m[0]);
      packs.add(m[1]!);
    }
  const glyphs = request.icons?.() ?? [];
  for (const g of glyphs) {
    const n = iconName(g);
    if (n) packs.add(n.prefix);
  }
  wanted = { labels, glyphs, packs };
  wantedByParse.set(parse, wanted);
  return wanted;
}

/** `s`, cut to {@link QUOTE} characters. */
const quote = (s: string): string => (s.length > QUOTE ? `${s.slice(0, QUOTE)}…` : s);

const isObject = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === 'object' && v !== null;

/** Pack `prefix`'s icon `name`, or why it is not drawn. `get()` is unchecked: packs are data. */
function find(packs: IconPacks | undefined, prefix: string, name: string): Found {
  if (!packs) return { why: 'no icon packs' };
  const pack = `pack "${quote(prefix)}"`;
  const state = packs.state(prefix);
  if (state === undefined) return { why: `no ${pack} is registered` };
  if (state === 'pending')
    return wantedByPacks.get(packs)?.packs.has(prefix)
      ? { pending: true }
      : { why: `${pack} has not loaded: call prepare() first` };
  if (state === 'failed')
    return { why: `${pack} failed to load (${quote(packs.error(prefix) ?? 'its loader failed')})` };
  const data: unknown = packs.get(prefix);
  if (!isObject(data) || !isObject(data.icons)) return { why: `${pack} is not Iconify JSON` };
  let built = builtByPack.get(data);
  if (!built) builtByPack.set(data, (built = new Map<string, BuiltIcon | undefined>()));
  let icon = built.get(name);
  if (!built.has(name)) {
    const resolved = getIcon(data as unknown as IconifyJSON, name);
    icon = resolved && buildIcon(resolved);
    built.set(name, icon);
  }
  return icon ? { icon } : { why: `${pack} has no icon "${quote(name)}"` };
}

/** An icon as written: in a label (`fa:fa-car`) or outside one (a glyph name, `fa:car`). */
interface Use {
  readonly written: string;
  readonly label: boolean;
}

/** A label icon's pack and icon (`fa:fa-car` → `fa`, `car`). */
function inLabelText(packs: IconPacks | undefined, source: string): Found {
  const m = LABEL.exec(source)!;
  return find(packs, m[1]!, m[2]!);
}

/** A glyph name's pack and icon (`fa:car`, or `car` with a fallback). */
function asGlyph(packs: IconPacks | undefined, written: string, fallbackPrefix?: string): Found {
  const n = iconName(written, fallbackPrefix);
  return n ? find(packs, n.prefix, n.name) : { why: NOT_A_NAME };
}

const same = (a: Use, b: Use): boolean => a.written === b.written && a.label === b.label;

const resolve = (packs: IconPacks | undefined, use: Use, fallbackPrefix?: string): Found =>
  use.label ? inLabelText(packs, use.written) : asGlyph(packs, use.written, fallbackPrefix);

/** The diagram's icons (labels, then shapes), with `current` among them, each once. */
function drawn(packs: IconPacks | undefined, current: Use): readonly Use[] {
  const wanted = packs && wantedByPacks.get(packs);
  const uses: Use[] = wanted
    ? [
        ...wanted.labels.map((written) => ({ written, label: true })),
        ...wanted.glyphs.map((written) => ({ written, label: false })),
      ]
    : [];
  if (!uses.some((u) => same(u, current))) uses.push(current);
  return uses.filter((u, i) => uses.findIndex((v) => same(u, v)) === i);
}

function listed(items: readonly string[]): string {
  const more = items.length - LISTED;
  return items.slice(0, LISTED).join(', ') + (more > 0 ? ` and ${String(more)} more` : '');
}

/**
 * One `ICON_NOT_RENDERED` per render (D291), naming every icon of the diagram that does not
 * resolve and why. `current` is the first one this render met.
 */
function notRendered(
  warn: Warn,
  packs: IconPacks | undefined,
  current: Use,
  why: string,
  fallbackPrefix?: string
): void {
  const done = warned.get(warn) ?? {};
  warned.set(warn, done);
  if (done.unresolved) return;
  done.unresolved = true;
  const items: string[] = [];
  for (const use of drawn(packs, current)) {
    const isCurrent = same(use, current);
    const f = isCurrent ? { why } : resolve(packs, use, fallbackPrefix);
    if (!('why' in f)) continue;
    // A glyph name without a pack may resolve with the fallback the diagram passes at draw.
    if (!isCurrent && f.why === NOT_A_NAME) continue;
    items.push(`${quote(use.written)} (${f.why})`);
  }
  warn({
    code: 'ICON_NOT_RENDERED',
    message: `Icons not rendered: ${listed(items)}. Labels show them as written.`,
  });
}

/** One `ICON_SIMPLIFIED` per render (D295), naming every icon of the diagram drawn simplified. */
function simplified(warn: Warn, packs: IconPacks | undefined, current: Use): void {
  const done = warned.get(warn) ?? {};
  warned.set(warn, done);
  if (done.simplified) return;
  done.simplified = true;
  const items = drawn(packs, current).flatMap((use) => {
    if (same(use, current)) return [quote(use.written)];
    const f = resolve(packs, use);
    return 'icon' in f && f.icon.simplified ? [quote(use.written)] : [];
  });
  warn({
    code: 'ICON_SIMPLIFIED',
    message: `Icons drawn simplified (gradients, masks, references and other parts an icon may not hold are dropped, url() paints become currentColor): ${listed(items)}.`,
  });
}

/** A length for a transform: to a millionth of a px, so fitting stays exact in practice. */
const len = (n: number): string => String(Math.round(n * 1e6) / 1e6 || 0);

/** `nodes` scaled by `s` and moved by (`dx`, `dy`). */
function placed(nodes: readonly SvgFragment[], dx: number, dy: number, s: number): SvgFragment {
  const at = dx === 0 && dy === 0 ? '' : `translate(${len(dx)},${len(dy)}) `;
  return { tag: 'g', attrs: { transform: `${at}scale(${len(s)})` as Transform }, children: nodes };
}

const isCurrent = (paint: unknown): boolean =>
  typeof paint === 'string' && /^currentColor$/i.test(paint);

/**
 * `nodes` with each `currentColor` fill left off where nothing in the icon above it sets a fill,
 * so it inherits the label's fill, its text colour (as v12's `.label-icon path`). Other paints
 * stay: a `currentColor` stroke is the page's text colour.
 */
function inLabel(
  nodes: readonly (SvgFragment | string)[],
  clean: boolean
): (SvgFragment | string)[] {
  return nodes.map((n) => {
    if (typeof n === 'string') return n;
    let { attrs } = n;
    let inherit = clean;
    if (attrs?.fill !== undefined) {
      if (clean && isCurrent(attrs.fill)) {
        const { fill: _, ...rest } = attrs;
        attrs = rest;
      } else inherit = false;
    }
    return {
      tag: n.tag,
      ...(attrs ? { attrs } : {}),
      ...(n.children ? { children: inLabel(n.children, inherit) } : {}),
    };
  });
}

function labelNodesOf(icon: BuiltIcon): readonly SvgFragment[] {
  let nodes = labelNodes.get(icon);
  if (!nodes) labelNodes.set(icon, (nodes = inLabel(icon.nodes, true) as SvgFragment[]));
  return nodes;
}

const label: InlineProvider = {
  pattern: LABEL,
  box(source: string, request: InlineRequest): InlineBox | undefined {
    // `source` is the whole match.
    const use = { written: source, label: true };
    const f = inLabelText(request.iconPacks, source);
    const size = request.font.size;
    const baseline = 0.875 * size;
    if ('icon' in f) {
      if (f.icon.simplified) simplified(request.warn, request.iconPacks, use);
      const [left, top, w, h] = f.icon.viewBox;
      const s = size / h;
      return {
        width: w * s,
        height: size,
        baseline,
        node: placed(labelNodesOf(f.icon), -left * s, -top * s, s),
      };
    }
    // The pack is still loading and the API knows (placeholders): an empty 1em box (D299).
    if ('pending' in f) return { width: size, height: size, baseline, node: { tag: 'g' } };
    notRendered(request.warn, request.iconPacks, use, f.why);
    return undefined;
  },
};

/** The icons extension: register it with `registerExternalDiagrams([icons])`. */
export const icons: ExtensionPlugin = {
  id: 'icons',
  claims: ['icons'],
  inline: [label],
  glyphs: {
    glyph(written, request) {
      const { size, fallbackPrefix, iconPacks } = request;
      if (!(size > 0 && Number.isFinite(size))) return undefined;
      const use = { written, label: false };
      const f = asGlyph(iconPacks, written, fallbackPrefix);
      if ('icon' in f) {
        if (f.icon.simplified) simplified(request.warn, iconPacks, use);
        const [left, top, w, h] = f.icon.viewBox;
        const s = size / Math.max(w, h);
        return placed(f.icon.nodes, (size - w * s) / 2 - left * s, (size - h * s) / 2 - top * s, s);
      }
      // Still loading, with placeholders: the diagram draws the frame alone (D299).
      if ('pending' in f) return undefined;
      notRendered(request.warn, iconPacks, use, f.why, fallbackPrefix);
      return undefined;
    },
  },
  resources: {
    // Packs are the API object's (D294): it loads each `iconPack` this reports.
    provides: [],
    missing(parse, request) {
      if (request.format !== 'svg') return [];
      const wanted = wantedOf(parse, request);
      wantedByPacks.set(request.iconPacks, wanted);
      const packs = request.iconPacks;
      return [...wanted.packs].flatMap((name) => {
        const state = packs.state(name);
        return state === 'pending' || state === 'failed' ? [{ kind: 'iconPack', name }] : [];
      });
    },
    load: () => Promise.resolve(),
  },
};

export default icons;
