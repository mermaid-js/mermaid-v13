/**
 * Architecture's icons (D505, D506): the seven built-ins drawn by the package, pack icons through
 * the extensions' glyphs (`RenderContext.icon`, D293), v12's `?` square for anything else, and
 * text icons laid out in the `blank` square.
 *
 * The built-ins are v12's `architectureIcons.ts` (80 × 80, `#087ebf` with white strokes, the same
 * in every theme, D152) as package constants: each element as v12 wrote it, its `style` written
 * as presentation attributes and its `id`/`data-name` dropped (they would repeat on a page).
 * `unknown` is v12's `unknownIcon` (`rendering-util/icons.ts`). A size other than 80 scales them.
 */
import type { Point } from '@mermaid-js/core/layout';
import {
  checkStyle,
  scale,
  transforms,
  translate,
  writeFragment,
  type Attrs,
  type PathData,
  type SafeColor,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import {
  layoutLabel,
  type FontKey,
  type MeasuredLabel,
  type Run,
  type SvgFragment,
} from '@mermaid-js/core/text';
import type { ArchitectureRenderContext } from './context.ts';

export const ICON_NOT_RENDERED = 'ICON_NOT_RENDERED';

/** The side of v12's icon squares, which every built-in is drawn in. */
const SIDE = 80;
/** v12's icon square and its white strokes. */
const BLUE = '#087ebf' as SafeColor;
const WHITE = '#fff' as SafeColor;
/** v12's `.node-icon-text > div { margin: 1px }`: the room a text icon keeps from its square. */
const TEXT_MARGIN = 1;
const ELLIPSIS = '…';

/** How many unresolved names the warning lists, and how long each may be (as mindmap's). */
const LISTED = 8;
const LONGEST = 60;

/** Path data written here, in v12's own (relative) form: package constants, never input. */
const d = (data: string): PathData => data as PathData;

/** `fill: none; stroke: #fff; stroke-miterlimit: 10; stroke-width: 2px`. */
const LINE: Attrs = { fill: 'none', stroke: WHITE, 'stroke-miterlimit': 10, 'stroke-width': 2 };
/** The same without its width (the server's slot outlines). */
const THIN: Attrs = { fill: 'none', stroke: WHITE, 'stroke-miterlimit': 10 };
/** `fill: #fff; stroke-width: 0px`. */
const SOLID: Attrs = { fill: WHITE, 'stroke-width': 0 };
/** `fill: #fff; stroke: #fff; stroke-miterlimit: 10`. */
const DOT: Attrs = { fill: WHITE, stroke: WHITE, 'stroke-miterlimit': 10 };

const el = (
  tag: SvgFragment['tag'],
  attrs: Attrs,
  children?: readonly (SvgFragment | string)[]
): SvgFragment => (children ? { tag, attrs, children } : { tag, attrs });
const path = (data: string, paint: Attrs): SvgFragment => el('path', { d: d(data), ...paint });
const line = (x1: number, y1: number, x2: number, y2: number): SvgFragment =>
  el('line', { x1, y1, x2, y2, ...LINE });
const ellipse = (cx: number, cy: number, rx: number, ry: number, paint = LINE): SvgFragment =>
  el('ellipse', { cx, cy, rx, ry, ...paint });

/** v12's `wrapIcon`: the blue square under the glyph. */
const wrap = (glyph: readonly SvgFragment[]): SvgFragment =>
  el('g', {}, [el('rect', { width: SIDE, height: SIDE, fill: BLUE, 'stroke-width': 0 }), ...glyph]);

/** The database's arcs (v12 `database`), top to bottom of the stack. */
const arc = (y: string): SvgFragment =>
  path(`m20,${y}c0,3.94,8.95,7.14,20,7.14s20-3.2,20-7.14`, LINE);
/** One of the server's three slots: its handle, then its three lights. */
const slot = (y: number): SvgFragment => {
  const handle = `m56.25,${y}c0,.27-.45.5-1,.5h-10.5c-.55,0-1-.23-1-.5s.45-.5,1-.5h10.5c.55,0,1,.23,1,.5Z`;
  return el('g', {}, [path(handle, SOLID), path(handle, THIN)]);
};
const lights = (y: number): SvgFragment =>
  el(
    'g',
    {},
    [32.5, 27.5, 22.5].map((cx) => el('circle', { cx, cy: y, r: 0.75, ...DOT }))
  );

let builtins: ReadonlyMap<string, SvgFragment> | undefined;

/** v12's seven icons, built once. */
function builtinIcons(): ReadonlyMap<string, SvgFragment> {
  if (builtins) return builtins;
  const question = {
    fill: WHITE,
    ...checkStyle(['font-family: ArialMT, Arial', 'font-size: 67.75px']).text,
  };
  builtins = new Map<string, SvgFragment>([
    [
      'database',
      wrap([
        arc('57.86'),
        arc('45.95'),
        arc('34.05'),
        ellipse(40, 22.14, 20, 7.14),
        line(20, 57.86, 20, 22.14),
        line(60, 57.86, 60, 22.14),
      ]),
    ],
    [
      'server',
      wrap([
        el('rect', { x: 17.5, y: 17.5, width: 45, height: 45, rx: 2, ry: 2, ...LINE }),
        line(17.5, 32.5, 62.5, 32.5),
        line(17.5, 47.5, 62.5, 47.5),
        slot(25),
        slot(40),
        slot(55),
        lights(25),
        lights(40),
        lights(55),
      ]),
    ],
    [
      'disk',
      wrap([
        el('rect', { x: 20, y: 15, width: 40, height: 50, rx: 1, ry: 1, ...LINE }),
        ellipse(24, 19.17, 0.8, 0.83),
        ellipse(56, 19.17, 0.8, 0.83),
        ellipse(24, 60.83, 0.8, 0.83),
        ellipse(56, 60.83, 0.8, 0.83),
        ellipse(40, 33.75, 14, 14.58),
        ellipse(40, 33.75, 4, 4.17, { ...DOT, 'stroke-width': 2 }),
        path(
          'm37.51,42.52l-4.83,13.22c-.26.71-1.1,1.02-1.76.64l-4.18-2.42c-.66-.38-.81-1.26-.33-1.84l9.01-10.8c.88-1.05,2.56-.08,2.09,1.2Z',
          SOLID
        ),
      ]),
    ],
    [
      'internet',
      wrap([
        el('circle', { cx: 40, cy: 40, r: 22.5, ...LINE }),
        line(40, 17.5, 40, 62.5),
        line(17.5, 40, 62.5, 40),
        path('m39.99,17.51c-15.28,11.1-15.28,33.88,0,44.98', LINE),
        path('m40.01,17.51c15.28,11.1,15.28,33.88,0,44.98', LINE),
        line(19.75, 30.1, 60.25, 30.1),
        line(19.75, 49.9, 60.25, 49.9),
      ]),
    ],
    [
      'cloud',
      wrap([
        path(
          'm65,47.5c0,2.76-2.24,5-5,5H20c-2.76,0-5-2.24-5-5,0-1.87,1.03-3.51,2.56-4.36-.04-.21-.06-.42-.06-.64,0-2.6,2.48-4.74,5.65-4.97,1.65-4.51,6.34-7.76,11.85-7.76.86,0,1.69.08,2.5.23,2.09-1.57,4.69-2.5,7.5-2.5,6.1,0,11.19,4.38,12.28,10.17,2.14.56,3.72,2.51,3.72,4.83,0,.03,0,.07-.01.1,2.29.46,4.01,2.48,4.01,4.9Z',
          LINE
        ),
      ]),
    ],
    // v12's `unknownIcon`, its `translate(21.16 64.67)` written as the text's position.
    ['unknown', wrap([el('text', { x: 21.16, y: 64.67, ...question }, ['?'])])],
    ['blank', wrap([])],
  ]);
  return builtins;
}

/** Whether `name` is one of the seven built-ins (D505). */
export function isBuiltinIcon(name: string): boolean {
  return builtinIcons().has(name);
}

/** Whether `name` names a pack (`logos:aws`): the extensions' glyphs are asked for it (D505). */
export function isPackIcon(name: string): boolean {
  return name.includes(':');
}

/** Writes a built-in icon in a `size` square with its corner at `at`. */
function drawBuiltin(w: SvgWriter, name: string, size: number, at: Point): void {
  const icon = builtinIcons().get(name)!;
  const k = size / SIDE;
  const parts = [];
  if (at.x !== 0 || at.y !== 0) parts.push(translate(at.x, at.y));
  if (k !== 1) parts.push(scale(k));
  // The icon's own `g` (v12's `wrapIcon`) carries the placement.
  writeFragment(
    w,
    parts.length === 0
      ? icon
      : { ...icon, attrs: { ...icon.attrs, transform: transforms(...parts) } }
  );
}

/**
 * Draws the icon `name` in a `size` square with its corner at `at`: a built-in, a pack's glyph,
 * nothing while its pack loads (D299), or v12's `?` square. True when it drew the `?` for a name
 * no extension warned about (the render's one `ICON_NOT_RENDERED` lists it).
 */
export function drawIcon(
  w: SvgWriter,
  ctx: ArchitectureRenderContext,
  name: string,
  size: number,
  at: Point
): boolean {
  if (isBuiltinIcon(name)) {
    drawBuiltin(w, name, size, at);
    return false;
  }
  const glyph = isPackIcon(name) ? ctx.icon?.(name, size) : undefined;
  if (glyph) {
    w.open('g', { transform: translate(at.x, at.y) });
    writeFragment(w, glyph);
    w.close();
    return false;
  }
  // `undefined` is a placeholder only while the API knows the pack is loading (D294, D299).
  const pack = name.slice(0, name.lastIndexOf(':'));
  if (glyph === undefined && pack && ctx.icon && ctx.iconPacks?.state(pack) === 'pending')
    return false;
  drawBuiltin(w, 'unknown', size, at);
  return glyph !== null;
}

/**
 * The render's one `ICON_NOT_RENDERED` (D291, D505) for the names drawn as v12's `?` that no
 * extension warned about, through the inline providers' deduplicating `warn` when there are any.
 */
export function iconsNotRendered(ctx: ArchitectureRenderContext, names: readonly string[]): void {
  const quoted = names
    .slice(0, LISTED)
    .map((n) => JSON.stringify(n.slice(0, LONGEST)))
    .join(', ');
  const more = names.length > LISTED ? ` and ${String(names.length - LISTED)} more` : '';
  const warning = {
    code: ICON_NOT_RENDERED,
    message: `Icons not rendered: ${quoted}${more}. Architecture draws database, server, disk, internet, cloud, blank and unknown itself; a pack icon (pack:name) needs an icons extension with that pack. Each is drawn as a "?" square.`,
  };
  if (ctx.inline) ctx.inline.warn(warning);
  else ctx.warn(warning);
}

/**
 * A text icon's text (D506): laid out as a label wrapped to the square less v12's 1 px margin,
 * cut to the lines that fit (v12's `-webkit-line-clamp`) and to the width, the last kept line
 * ending in an ellipsis where anything was cut. Undefined when not one line fits.
 */
export function fitTextIcon(
  text: string,
  size: number,
  font: FontKey,
  ctx: ArchitectureRenderContext
): MeasuredLabel | undefined {
  const room = size - 2 * TEXT_MARGIN;
  if (!(room > 0)) return undefined;
  const label = layoutLabel(text, font, room, ctx.measurer, { inline: ctx.inline });
  const most = Math.floor(room / label.lineHeight);
  if (most < 1 || label.lines.length === 0) return undefined;
  const cut = label.lines.length > most;
  if (!cut && label.width <= room) return label;
  const lines: Run[][] = [];
  const widths: number[] = [];
  const indents: number[] = [];
  for (let i = 0; i < Math.min(most, label.lines.length); i++) {
    let runs = label.lines[i]!;
    let width = label.widths[i]!;
    if (width > room || (cut && i === most - 1)) [runs, width] = ellipsised(runs, room, font, ctx);
    lines.push(runs);
    widths.push(width);
    indents.push(label.indents[i] ?? 0);
  }
  return {
    ...label,
    lines,
    widths,
    indents,
    width: Math.max(0, ...widths),
    height: lines.length * label.lineHeight,
    ...(label.baselines ? { baselines: label.baselines.slice(0, lines.length) } : {}),
  };
}

/** `runs` cut from the end until it and an ellipsis fit in `room`, and its width. */
function ellipsised(
  runs: readonly Run[],
  room: number,
  font: FontKey,
  ctx: ArchitectureRenderContext
): [Run[], number] {
  const out = [...runs];
  let width = out.reduce((s, r) => s + r.width, 0);
  for (;;) {
    const last = out.pop();
    if (last === undefined) {
      const dots = ctx.measurer.width(ELLIPSIS, font, 0);
      return [[{ text: ELLIPSIS, style: 0, width: dots }], dots];
    }
    const rest = width - last.width;
    const dots = ctx.measurer.width(ELLIPSIS, font, last.style);
    if (last.kind !== 'box' && rest + dots <= room) {
      // The longest head of this run that fits with the ellipsis (whole code points).
      const chars = [...last.text];
      let keep = chars.length;
      const widthOf = (n: number): number =>
        ctx.measurer.width(chars.slice(0, n).join('').trimEnd() + ELLIPSIS, font, last.style);
      while (keep > 0 && rest + widthOf(keep) > room) keep--;
      const text = chars.slice(0, keep).join('').trimEnd() + ELLIPSIS;
      const run: Run = { ...last, text, width: widthOf(keep) };
      out.push(run);
      return [out, rest + run.width];
    }
    width = rest;
  }
}

/** Writes a text icon: the `blank` square with the fitted text centred in it, in white. */
export function drawTextIcon(
  w: SvgWriter,
  label: MeasuredLabel | undefined,
  size: number,
  at: Point
): void {
  drawBuiltin(w, 'blank', size, at);
  if (label)
    w.label(label, at.x + size / 2, at.y + size / 2, { class: 'node-icon-text', fill: WHITE });
}
