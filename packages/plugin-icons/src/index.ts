/**
 * The icons extension plugin, `@mermaid-js/plugin-icons` (D290–D299): Iconify icon packs drawn
 * as allow-listed SVG nodes (D295).
 *
 * - In labels, `fa:fa-car` and the other D296 prefixes become an inline box (D177, D293) 1em
 *   tall at the label's font size, as wide as the icon's aspect makes it, its bottom 0.125em
 *   below the baseline (v12's `.label-icon`). Its `currentColor` paints take the label's text
 *   colour: fills inherit the label's fill, and an icon that still paints `currentColor` (a
 *   stroke) gets `color` set to that fill in `postRender`.
 * - Outside labels (flowchart icon shapes, mindmap `::icon()`), `RenderContext.icon` gets the
 *   glyph fitted into the square the diagram asks for (xMidYMid meet). It keeps `currentColor`,
 *   which the diagram sets.
 *
 * The packs are the `mermaid` API object's (`registerIconPacks`, D294): this plugin reads them
 * through the request and keeps none. `resources.missing` reports each registered pack a parsed
 * diagram names that has not loaded, so `prepare()` runs only those loaders and a diagram
 * without icons runs none (D290). An icon that does not resolve is shown as written, with one
 * `ICON_NOT_RENDERED` per render naming the icons (D291); a pack still loading draws a
 * placeholder, an empty 1em box in labels and nothing in shapes (D299: `missing()` reported it,
 * so the API threw `NotLoadedError` or, with placeholders, warned `PLACEHOLDER`); an icon the
 * converter changed gives one `ICON_SIMPLIFIED` per render (D295). The providers note what they
 * meet in the render's scratch (`InlineRequest.scratch`, `GlyphRequest.scratch`); `postRender`
 * reads it there (`ctx.inline.scratch`) and gives the two warnings, once each, naming the icons in
 * the order drawn. A glyph that does not resolve is `null`, so flowchart gives its deprecated
 * `ICON_UNAVAILABLE` beside this warning (D299): no diagram is named here.
 *
 * The plugin keeps no state (D294). Its module-level WeakMaps are memoisation of pure functions
 * (the packs a parse names, an icon built from a pack object, a built icon's label nodes): each
 * value is a function of its key alone, so dropping any entry changes no output, and nothing
 * carries `missing()` results or a render's notes to the draw.
 */
import type { DiagramIcon, ExtensionPlugin, IconPacks, ResourceRequest } from '@mermaid-js/core';
import type { ParseResult } from '@mermaid-js/core/parser-kit';
import type { Paint, SvgNode, SvgTree, Transform } from '@mermaid-js/core/svg';
import type {
  InlineBox,
  InlineProvider,
  InlineRequest,
  InlineSpans,
  SvgFragment,
} from '@mermaid-js/core/text';
import { buildIcon, type BuiltIcon } from './icon.ts';
import { iconName } from './name.ts';
import { getIcon, type IconifyJSON } from './resolve.ts';

export type { IconifyAlias, IconifyIcon, IconifyJSON } from './resolve.ts';

/**
 * D296: v12's label prefixes plus `fad`, with no left boundary; the pack, then the icon. Core's
 * `ICON_NOT_RENDERED` feature has the same regex (`core/src/text/inline.ts` `FEATURES`): keep
 * them equal, so this provider claims every span core would warn about.
 */
// cspell:disable-next-line
const LABEL = /(fa[bdklrs]?):fa-([\w-]+)/;
const LABELS = new RegExp(LABEL.source, 'g');
/** How much of a name as written a warning quotes. */
const QUOTE = 60;
/** How many icons a warning names. */
const LISTED = 8;

/** An icon ready to draw, a pack still loading that the API reported, or why it is not drawn. */
type Found = { readonly icon: BuiltIcon } | { readonly pending: true } | { readonly why: string };

/** Why a glyph name is not drawn when it splits into no pack and icon. */
const NOT_A_NAME = 'not a pack:name icon name';

/**
 * The packs a parse names, per parse (the API caches it with the analysis), so `renderSync` does
 * not walk it again. Memoisation, as the two maps below: a pure result per key object.
 */
const packsByParse = new WeakMap<object, ReadonlySet<string>>();
/** Each pack's built icons, per pack object (a re-registered pack is a new object). */
const builtByPack = new WeakMap<object, Map<string, BuiltIcon | undefined>>();
/** Each built icon's nodes as a label draws them, and whether any still paints currentColor. */
const labelNodes = new WeakMap<BuiltIcon, { nodes: readonly SvgFragment[]; current: boolean }>();
/**
 * The class a label icon that still paints `currentColor` (a stroke, a fill under a fill the
 * icon sets) carries until `postRender` gives it the label's colour and takes the class off.
 */
const RECOLOUR = 'mermaid-label-icon';
/** What one render's providers met, for its `postRender` to warn about once. */
interface Notes {
  /** Each icon not drawn, by kind and name as written, with why, in the order met. */
  readonly unresolved: Map<string, string>;
  readonly simplified: Set<string>;
  labels: boolean;
  glyphs: boolean;
}

/** This render's notes, in its scratch under the extension's id (`ctx.inline.scratch`). */
function notesOf(scratch: Record<string, unknown>): Notes {
  return (scratch.icons ??= {
    unresolved: new Map(),
    simplified: new Set(),
    labels: false,
    glyphs: false,
  }) as Notes;
}

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

/** A glyph name as `DiagramPlugin.icons` lists it, split into its pack and icon. */
const splitIcon = (icon: DiagramIcon) =>
  typeof icon === 'string' ? iconName(icon) : iconName(icon.name, icon.fallbackPrefix);

/**
 * The packs a parsed diagram names: in its labels (else any string it holds) and its shapes, with
 * the fallback each shape is drawn with.
 */
function packsOf(parse: ParseResult<unknown>, request: ResourceRequest): ReadonlySet<string> {
  const cached = packsByParse.get(parse);
  if (cached) return cached;
  let texts: readonly string[];
  if (request.labels) texts = request.labels();
  else {
    const all: string[] = [];
    strings(parse.ast, all);
    strings(parse.model, all);
    texts = all;
  }
  const found = new Set<string>();
  for (const text of texts) for (const m of text.matchAll(LABELS)) found.add(m[1]!);
  for (const icon of request.icons?.() ?? []) {
    const n = splitIcon(icon);
    if (n) found.add(n.prefix);
  }
  packsByParse.set(parse, found);
  return found;
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
  // `missing()` reported it: the API threw NotLoadedError, or warned PLACEHOLDER (D299).
  if (state === 'pending') return { pending: true };
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

/** Notes that the icon `written` (in a label or a glyph name) is not drawn, and why. */
function unresolved(notes: Notes, written: string, label: boolean, why: string): void {
  const key = `${label ? 'l' : 'g'}${written}`;
  if (notes.unresolved.has(key)) return;
  notes.unresolved.set(key, `${quote(written)} (${why})`);
  if (label) notes.labels = true;
  else notes.glyphs = true;
}

function listed(items: Iterable<string>): string {
  const all = [...items];
  const more = all.length - LISTED;
  return all.slice(0, LISTED).join(', ') + (more > 0 ? ` and ${String(more)} more` : '');
}

/**
 * One render's `ICON_NOT_RENDERED` (D291) and `ICON_SIMPLIFIED` (D295), each naming the icons in
 * the order drawn, through the render's once-per-render sink. (A diagram's deprecated alias for
 * its shapes, flowchart's `ICON_UNAVAILABLE`, is the diagram's: the glyph it got was `null`.)
 */
function warnFor({ warn, scratch }: InlineSpans): void {
  const notes = scratch.icons as Notes | undefined;
  if (!notes) return;
  if (notes.unresolved.size > 0) {
    const where = [
      notes.labels ? 'labels show them as written' : '',
      notes.glyphs ? 'their shapes are drawn without them' : '',
    ].filter(Boolean);
    const said = where.join('; ');
    warn({
      code: 'ICON_NOT_RENDERED',
      message: `Icons not rendered: ${listed(notes.unresolved.values())}. ${said[0]!.toUpperCase()}${said.slice(1)}.`,
    });
  }
  if (notes.simplified.size > 0)
    warn({
      code: 'ICON_SIMPLIFIED',
      message: `Icons drawn simplified (gradients, masks, references and other parts an icon may not hold are dropped, url() paints become currentColor): ${listed(notes.simplified)}.`,
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
 * stay: `postRender` points the `currentColor` left (strokes) at the label's fill.
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

/** Whether any attribute in `nodes` paints `currentColor`. */
const paintsCurrent = (nodes: readonly (SvgFragment | string)[]): boolean =>
  nodes.some(
    (n) =>
      typeof n !== 'string' &&
      (Object.values(n.attrs ?? {}).some(isCurrent) || paintsCurrent(n.children ?? []))
  );

function labelNodesOf(icon: BuiltIcon): { nodes: readonly SvgFragment[]; current: boolean } {
  let built = labelNodes.get(icon);
  if (!built) {
    const nodes = inLabel(icon.nodes, true) as SvgFragment[];
    labelNodes.set(icon, (built = { nodes, current: paintsCurrent(nodes) }));
  }
  return built;
}

/** A `fill:` declaration in a `style` attribute. */
const STYLE_FILL = /(?:^|;)\s*fill\s*:\s*([^;!]+?)\s*(?:!important\s*)?(?:;|$)/i;

/**
 * The fill `node` inherits: the nearest `style` fill or `fill` attribute above it, which is the
 * label's text colour (labels take their colour from attributes; theme sheets set only
 * variables). Undefined for none, or for a gradient, which `color` cannot take.
 */
function inheritedFill(tree: SvgTree, node: SvgNode): Paint | undefined {
  for (let n = tree.parent(node); n !== undefined; n = tree.parent(n)) {
    const paint = STYLE_FILL.exec(tree.getAttr(n, 'style') ?? '')?.[1] ?? tree.getAttr(n, 'fill');
    if (paint !== undefined)
      return paint === 'none' || /url\(/i.test(paint) ? undefined : (paint as Paint);
  }
  return undefined;
}

const label: InlineProvider = {
  pattern: LABEL,
  box(source: string, request: InlineRequest): InlineBox | undefined {
    // `source` is the whole match.
    const f = inLabelText(request.iconPacks, source);
    const size = request.font.size;
    const baseline = 0.875 * size;
    if ('icon' in f) {
      if (f.icon.simplified) notesOf(request.scratch).simplified.add(quote(source));
      const [left, top, w, h] = f.icon.viewBox;
      const s = size / h;
      const { nodes, current } = labelNodesOf(f.icon);
      const node = placed(nodes, -left * s, -top * s, s);
      return {
        width: w * s,
        height: size,
        baseline,
        node: current ? { ...node, attrs: { class: RECOLOUR, ...node.attrs } } : node,
      };
    }
    // The pack is still loading and the API knows (placeholders): an empty 1em box (D299).
    if ('pending' in f) return { width: size, height: size, baseline, node: { tag: 'g' } };
    unresolved(notesOf(request.scratch), source, true, f.why);
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
      const f = asGlyph(iconPacks, written, fallbackPrefix);
      if ('icon' in f) {
        if (f.icon.simplified) notesOf(request.scratch).simplified.add(quote(written));
        const [left, top, w, h] = f.icon.viewBox;
        const s = size / Math.max(w, h);
        return placed(f.icon.nodes, (size - w * s) / 2 - left * s, (size - h * s) / 2 - top * s, s);
      }
      // Still loading, with placeholders: the diagram draws the frame alone (D299).
      if ('pending' in f) return undefined;
      unresolved(notesOf(request.scratch), written, false, f.why);
      // Unresolved, and warned in postRender: the diagram may give its own alias (D299).
      return null;
    },
  },
  // A `currentColor` stroke cannot point at the label's fill, so the icon's `color` is set to
  // the fill its label text inherits, once the label is placed in the tree. (With this hook,
  // renders write into the tree backing, whose output is the stream's byte for byte.) Only the
  // class alone marks an icon: a user class of the same name sits beside others (`node …`).
  // The warnings go out here, once the providers have met every icon of the render.
  postRender(tree, ctx) {
    for (const n of tree.find((node, t) => t.getAttr(node, 'class') === RECOLOUR)) {
      tree.setAttr(n, 'class', undefined);
      tree.setAttr(n, 'color', inheritedFill(tree, n));
    }
    if (ctx.inline) warnFor(ctx.inline);
  },
  resources: {
    // Packs are the API object's (D294): it loads each `iconPack` this reports, so this
    // extension provides none and `load` is never called (core requires the three fields).
    provides: [],
    missing(parse, request) {
      if (request.format !== 'svg') return [];
      const packs = request.iconPacks;
      return [...packsOf(parse, request)].flatMap((name) => {
        const state = packs.state(name);
        return state === 'pending' || state === 'failed' ? [{ kind: 'iconPack', name }] : [];
      });
    },
    load: () => Promise.resolve(),
  },
};

export default icons;
