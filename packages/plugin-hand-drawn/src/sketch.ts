/**
 * The sketch adapter (H1, D300, D304): an outline's tag and attributes in, the paths that draw
 * it hand-drawn out. roughjs's DOM-free generator makes the op sets; their numbers go through
 * core's `PathBuilder`, so `num()` formats every one and the output passes the allow-list.
 */
import { pathBuilder, type Attrs, type PathData } from '@mermaid-js/core/svg';
import roughBundle from 'roughjs/bundled/rough.esm.js';
import type { Drawable, Op, Options } from 'roughjs/bin/core.js';

/** The outline tags a diagram draws through `w.outline` (D302). */
export type SketchTag = 'rect' | 'circle' | 'ellipse' | 'polygon' | 'line' | 'path';

/** A role's roughjs options (the role table is H2's). */
export interface SketchOptions {
  /** Below 1, so roughjs's hachure filler never reaches `Math.random` (D304). */
  readonly roughness: number;
  readonly fillStyle: 'solid' | 'hachure';
  readonly fillWeight: number;
  readonly hachureGap: number;
  readonly hachureAngle?: number;
}

/** One `<path>` of a sketch, in the order roughjs draws them. */
export interface SketchPath {
  /** roughjs's op set: `fillPath` (solid fill), `fillSketch` (hachure) or `path` (outline). */
  readonly set: 'fillPath' | 'fillSketch' | 'path';
  readonly attrs: Attrs;
}

// roughjs has no `type: module`, so a loader that reads the bundle as CommonJS (tsx does, as the
// dev server runs) hands over its namespace as the default import: `{ default: rough }`.
const rough = (roughBundle as { default?: typeof roughBundle }).default ?? roughBundle;
const generator = rough.generator();

function toPath(ops: readonly Op[]): PathData {
  const p = pathBuilder();
  for (const { op, data: n } of ops) {
    if (op === 'move') p.moveTo(n[0]!, n[1]!);
    else if (op === 'lineTo') p.lineTo(n[0]!, n[1]!);
    else p.curveTo(n[0]!, n[1]!, n[2]!, n[3]!, n[4]!, n[5]!);
  }
  return p.done();
}

/** v12's `createRoundedRectPathD` (rendering-elements/shapes/roundedRectPath.ts at fa796a943). */
function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  return [
    ['M', x + r, y],
    ['H', x + w - r],
    ['A', r, r, 0, 0, 1, x + w, y + r],
    ['V', y + h - r],
    ['A', r, r, 0, 0, 1, x + w - r, y + h],
    ['H', x + r],
    ['A', r, r, 0, 0, 1, x, y + h - r],
    ['V', y + r],
    ['A', r, r, 0, 0, 1, x + r, y],
    ['Z'],
  ]
    .flat()
    .join(' ');
}

/**
 * The seed roughjs gets for a `handDrawnSeed` (D304): `seed | 0`, so a non-zero seed gives
 * v12's sketch, and 0 is 2147483647, because roughjs uses `Math.random` for seed 0 (D300).
 */
export function roughSeed(seed: number): number {
  return seed | 0 || 2147483647;
}

/**
 * roughjs's `strokeLineDash` for a `stroke-dasharray` value, as v12's `getStrokeDashArray`
 * (handDrawnShapeStyles.ts at fa796a943): the first two whitespace-separated numbers, one
 * number twice, 0 for what is not a number. roughjs's ops do not depend on it; the outline
 * path keeps the leaf's own `stroke-dasharray`.
 */
export function strokeLineDash(value: string | undefined): [number, number] {
  if (!value) return [0, 0];
  const [a, b = a] = value
    .trim()
    .split(/\s+/)
    .map((n) => Number(n) || 0);
  return [a ?? 0, b ?? 0];
}

/** roughjs's `strokeWidth` for a leaf's `stroke-width`, as v12: its number, else 1.3. */
function strokeWidth(value: Attrs['stroke-width']): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(value ?? '');
  return Number.isFinite(n) && n > 0 ? n : 1.3;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function rect(a: Attrs, o: Options): Drawable | undefined {
  const { width: w, height: h } = a;
  if (!isNum(w) || !isNum(h)) return undefined;
  const x = a.x ?? 0;
  const y = a.y ?? 0;
  // SVG clamps a corner radius to half the side; one radius, as v12's rounded shapes.
  const r = Math.min(a.rx ?? a.ry ?? 0, w / 2, h / 2);
  return r > 0
    ? generator.path(roundedRectPath(x, y, w, h, r), o)
    : generator.rectangle(x, y, w, h, o);
}

function polygon(a: Attrs, o: Options): Drawable | undefined {
  const n = a.points ?? [];
  const points: [number, number][] = [];
  for (let i = 0; i + 1 < n.length; i += 2) points.push([n[i]!, n[i + 1]!]);
  return points.length > 1 ? generator.polygon(points, o) : undefined;
}

/** The generator call for each tag; `undefined` when the outline's geometry is missing. */
const DRAW: Readonly<Record<SketchTag, (a: Attrs, o: Options) => Drawable | undefined>> = {
  rect,
  circle: (a, o) => (isNum(a.r) ? generator.circle(a.cx ?? 0, a.cy ?? 0, 2 * a.r, o) : undefined),
  ellipse: (a, o) =>
    isNum(a.rx) && isNum(a.ry)
      ? generator.ellipse(a.cx ?? 0, a.cy ?? 0, 2 * a.rx, 2 * a.ry, o)
      : undefined,
  polygon,
  line: (a, o) => generator.line(a.x1 ?? 0, a.y1 ?? 0, a.x2 ?? 0, a.y2 ?? 0, o),
  path: (a, o) => (a.d ? generator.path(a.d, o) : undefined),
};

const FILL_STYLES: ReadonlySet<string> = new Set(['solid', 'hachure']);

/**
 * Sketches one outline. `seed` is the diagram's `handDrawnSeed`. Returns `undefined` when the
 * geometry cannot be sketched, so the caller writes the plain leaf.
 */
export function sketch(
  tag: SketchTag,
  attrs: Attrs,
  options: SketchOptions,
  seed: number
): SketchPath[] | undefined {
  // roughjs's hachure filler draws with Math.random from roughness 1, and its dots filler
  // always does (D304).
  if (!(options.roughness < 1))
    throw new RangeError(`roughness must be below 1, not ${options.roughness}`);
  if (!FILL_STYLES.has(options.fillStyle))
    throw new RangeError(`fillStyle must be solid or hachure, not ${String(options.fillStyle)}`);
  const { fill, stroke } = attrs;
  const filled = fill !== undefined && fill !== 'none';
  const stroked = stroke !== undefined && stroke !== 'none';
  // Placeholder paints: roughjs only tests whether there is a fill and a stroke.
  const o: Options = {
    ...options,
    seed: roughSeed(seed),
    strokeWidth: strokeWidth(attrs['stroke-width']),
    strokeLineDash: strokeLineDash(attrs['stroke-dasharray']),
    fill: filled ? 'F' : undefined,
    stroke: stroked ? 'S' : 'none',
  };
  const drawable = DRAW[tag](attrs, o);
  if (!drawable) return undefined;
  return drawable.sets.map(({ type, ops }) => {
    const d = toPath(ops);
    switch (type) {
      case 'fillPath':
        return { set: type, attrs: { d, fill, stroke: 'none' } };
      case 'fillSketch':
        return {
          set: type,
          attrs: { d, fill: 'none', stroke: fill, 'stroke-width': options.fillWeight },
        };
      case 'path':
        return {
          set: type,
          attrs: {
            d,
            fill: 'none',
            stroke,
            'stroke-width': attrs['stroke-width'],
            'stroke-dasharray': attrs['stroke-dasharray'],
          },
        };
    }
  });
}
