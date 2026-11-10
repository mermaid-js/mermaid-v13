/**
 * Architecture's seven built-in icons (D505) as package constants: v12's `architectureIcons.ts`
 * (`#087ebf` squares with white strokes, the same in every theme, D152) and its `unknownIcon`
 * (`rendering-util/icons.ts`), each element as v12 wrote it, its `style` written as presentation
 * attributes and its `id`/`data-name` dropped (they would repeat on a page). They are drawn in
 * v12's 80 px icon square (`ART_SIZE`, the art's own, whatever the schema default) and scaled to
 * the document's `iconSize`.
 *
 * Icon art, not layout: the literal gate (`conformance/src/architecture/layout-literals.spec.ts`)
 * exempts this file, as it does the metrics table.
 */
import { checkStyle, type Attrs, type PathData, type SafeColor } from '@mermaid-js/core/svg';
import type { SvgFragment } from '@mermaid-js/core/text';

/** v12's pack, whose names a name without one resolves in (`fallbackPrefix`). */
export const BUILTIN_PACK = 'mermaid-architecture';

/** The square v12's icons are drawn in (`architectureIcons.ts`: every body is 80 × 80). */
export const ART_SIZE = 80;
const SIDE = ART_SIZE;
/** v12's icon square and its white strokes; text icons are white too (D506). */
const BLUE = '#087ebf' as SafeColor;
export const WHITE = '#fff' as SafeColor;

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
export function builtinIcons(): ReadonlyMap<string, SvgFragment> {
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
