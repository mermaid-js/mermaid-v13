/**
 * The outline drawer (D302): each outline a diagram writes with `w.outline` is sketched with its
 * role's options (`roles.ts`) by the adapter (`sketch.ts`, H1) and written through the sink.
 *
 * - A node, part, divider, mark or group becomes a `<g>` holding roughjs's paths in its order: the
 *   fill, then the outline. The `<g>` takes the leaf's other attributes (`class`, `filter`,
 *   `opacity`, `transform`, `style`, data attributes), so the shadow sits on it (D307).
 * - An edge stays one `<path>`: the leaf's attributes with a sketched `d`. Flowchart, class and
 *   state edges take their stroke from their `edgePaths` group, so the sketch gets a placeholder
 *   stroke and the path gets none of its own (#340).
 * - Paints are the leaf's only (D152): a gradient `stroke` strokes the sketch. An outline with
 *   nothing to sketch (no fill and no stroke, as hit boxes and region frames, or geometry roughjs
 *   cannot take) is written plain.
 */
import type { Attrs, OutlineRole, OutlineSink, OutlineTag } from '@mermaid-js/core/svg';
import { optionsFor } from './roles.ts';
import { sketch, type SketchPath } from './sketch.ts';

type Mutable = { -readonly [K in keyof Attrs]: Attrs[K] };

/** The attributes that place each tag: the sketch's `d` replaces them. */
const GEOMETRY: Readonly<Record<OutlineTag, readonly string[]>> = {
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  polygon: ['points'],
  line: ['x1', 'y1', 'x2', 'y2'],
  path: ['d'],
};
/** The paints `sketch` puts on its paths itself. */
const SKETCH_PAINT = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray'];
/** Stroke attributes that belong on the outline path, not on the `<g>`. */
const STROKE_ONLY = [
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dashoffset',
  'stroke-miterlimit',
];

const without = (attrs: Attrs, names: readonly string[]): Mutable => {
  const out: Mutable = { ...attrs };
  for (const n of names) delete out[n as keyof Attrs];
  return out;
};

/** What an edge's sketch is drawn with when the edge inherits its stroke (never written). */
const PLACEHOLDER_STROKE = 'currentColor';

/** Starts a render: the drawer is active when `handDrawn` is true (D303). */
export function activate(config: Readonly<Record<string, unknown>>): boolean {
  return config.handDrawn === true;
}

/** The render's seed, read from its own config on each draw: no module state (D655). */
function seedOf(config: Readonly<Record<string, unknown>>): number {
  const s = Number(config.handDrawnSeed ?? 0);
  return Number.isFinite(s) ? s : 0;
}

function drawEdge(tag: OutlineTag, attrs: Attrs, sink: OutlineSink, seed: number): boolean {
  if (attrs.stroke === 'none') return false;
  const paths = sketch(
    tag,
    { ...attrs, fill: undefined, stroke: attrs.stroke ?? PLACEHOLDER_STROKE },
    optionsFor('edge', attrs),
    seed
  );
  const outline = paths?.find((p) => p.set === 'path');
  if (!outline) return false;
  // A path keeps its attribute order; another tag's geometry gives way to `d`.
  const rest = tag === 'path' ? { ...attrs } : without(attrs, GEOMETRY[tag]);
  sink.leaf('path', { ...rest, d: outline.attrs.d });
  return true;
}

/** One of roughjs's paths with the leaf's stroke or fill extras. */
function pathAttrs(p: SketchPath, attrs: Attrs): Attrs {
  if (p.set === 'path') {
    const out: Mutable = { ...p.attrs };
    for (const n of STROKE_ONLY) (out as Record<string, unknown>)[n] = attrs[n as keyof Attrs];
    return out;
  }
  const opacity = attrs['fill-opacity'];
  return p.set === 'fillPath'
    ? { ...p.attrs, 'fill-opacity': opacity }
    : { ...p.attrs, 'stroke-opacity': opacity };
}

/** Sketches one outline with the seed of `config`, the render's (D655). */
export function draw(
  role: OutlineRole,
  tag: OutlineTag,
  attrs: Attrs,
  sink: OutlineSink,
  config: Readonly<Record<string, unknown>>
): boolean {
  const seed = seedOf(config);
  if (role === 'edge') return drawEdge(tag, attrs, sink, seed);
  const paths = sketch(tag, attrs, optionsFor(role, attrs), seed);
  if (!paths || paths.length === 0) return false;
  sink.open(
    'g',
    without(attrs, [...GEOMETRY[tag], ...SKETCH_PAINT, ...STROKE_ONLY, 'fill-opacity'])
  );
  for (const p of paths) sink.leaf('path', pathAttrs(p, attrs));
  sink.close();
  return true;
}
