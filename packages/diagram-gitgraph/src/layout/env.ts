/**
 * What the layout reads from the render context: `gitGraph` config, the fonts labels are drawn
 * in, plain-text measuring (D268), the geometry theme variables (D152), and bounding boxes.
 */
import type { RenderContext } from '@mermaid-js/core';
import { decodeEntities, type FontKey } from '@mermaid-js/core/text';
import { GIT_GEOMETRY, GIT_METRICS, type GitGeometry, type GitMetrics } from './metrics.ts';
import type { GitText, Point, Rect, Transform } from './types.ts';

/** What the layout reads from the render context. */
export type GitLayoutContext = Pick<RenderContext, 'config' | 'measurer' | 'theme'> &
  Partial<Pick<RenderContext, 'warn'>>;

/** A config length the layout can't honour (pitfall 22): it draws with the default instead. */
const GIT_CONFIG_IGNORED = 'GIT_CONFIG_IGNORED';

const WEIGHT_NORMAL = 400;
const WEIGHT_BOLD = 700;

function weightOf(value: string): number {
  if (value === 'bold' || value === 'bolder') return WEIGHT_BOLD;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : WEIGHT_NORMAL;
}

function lengthOf(
  value: unknown,
  fallback: number,
  path: string,
  warn: GitLayoutContext['warn']
): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (value !== undefined)
    warn?.({
      code: GIT_CONFIG_IGNORED,
      message: `Ignored ${path}: it is not a number of at least 0; using ${fallback}`,
      path,
    });
  return fallback;
}

/** The geometry variables (D152), as the layout uses them. */
export function geometryOf(theme: GitLayoutContext['theme']): GitGeometry {
  const n = (name: string): number => theme.number(name);
  const g = GIT_GEOMETRY;
  return {
    commitRadius: n(g.commitRadius),
    laneOffset: n(g.laneShift) - GIT_METRICS.axis.laneLift,
    branchLabelPaddingX: n(g.branchLabelPaddingX),
    branchLabelPaddingY: n(g.branchLabelPaddingY),
    branchLabelRadius: n(g.branchLabelRadius),
    branchLabelOffsetX: -n(g.branchLabelShiftX),
    branchLabelOffsetY: n(g.branchLabelOffsetY),
    arrowWidth: n(g.arrowWidth),
  };
}

export interface Env {
  readonly m: GitMetrics;
  readonly g: GitGeometry;
  readonly showCommitLabel: boolean;
  readonly showBranches: boolean;
  readonly rotateCommitLabel: boolean;
  readonly parallelCommits: boolean;
  readonly titleTopMargin: number;
  readonly diagramPadding: number;
  /** The branch lines' stroke (`strokeWidth`). */
  readonly lineWidth: number;
  readonly fonts: {
    readonly branch: FontKey;
    readonly commit: FontKey;
    readonly tag: FontKey;
    readonly title: FontKey;
  };
  /**
   * Plain text at (x, y) top-left, one line per entry of `lines` as the model holds them. Entity
   * codes are decoded here (D560), so the text is measured and drawn as its characters.
   */
  text(lines: readonly string[], font: FontKey, x?: number, y?: number): GitText;
}

export function envOf(ctx: GitLayoutContext): Env {
  const m = GIT_METRICS;
  const conf = (ctx.config.gitGraph ?? {}) as Readonly<Record<string, unknown>>;
  const { theme, measurer } = ctx;
  const family = theme.value('fontFamily');
  const weight = weightOf(theme.value('fontWeight'));
  const size = (name: string): number => {
    const n = theme.number(name);
    return Number.isFinite(n) && n > 0 ? n : theme.number('fontSize');
  };
  return {
    m,
    g: geometryOf(theme),
    showCommitLabel: conf.showCommitLabel !== false,
    showBranches: conf.showBranches !== false,
    rotateCommitLabel: conf.rotateCommitLabel !== false,
    parallelCommits: conf.parallelCommits === true,
    titleTopMargin: lengthOf(
      conf.titleTopMargin,
      m.common.titleTopMargin,
      'gitGraph.titleTopMargin',
      ctx.warn
    ),
    diagramPadding: lengthOf(
      conf.diagramPadding,
      m.common.diagramPadding,
      'gitGraph.diagramPadding',
      ctx.warn
    ),
    lineWidth: theme.number('strokeWidth'),
    fonts: {
      branch: { family, size: theme.number('fontSize'), weight },
      commit: { family, size: size('commitLabelFontSize'), weight },
      tag: { family, size: size('tagLabelFontSize'), weight: m.common.tagFontWeight },
      title: { family, size: m.common.titleFontSize, weight: m.common.titleFontWeight },
    },
    text(written, font, x = 0, y = 0) {
      const lines = written.map(decodeEntities);
      const { ascent, lineHeight } = measurer.metrics(font);
      let width = 0;
      for (const line of lines) width = Math.max(width, measurer.width(line, font, 0));
      return {
        lines,
        font,
        x,
        y,
        width,
        height: lines.length * lineHeight,
        lineHeight,
        baseline: ascent,
      };
    },
  };
}

/** `t` moved so that its first baseline is at (x, baseline). */
export const atBaseline = (t: GitText, x: number, baseline: number): GitText => ({
  ...t,
  x,
  y: baseline - t.baseline,
});

const DEG = Math.PI / 180;

/** Where `transform` takes `p`. */
export function apply(t: Transform | undefined, p: Point): Point {
  if (!t) return p;
  const a = t.angle * DEG;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const x = p.x - t.cx;
  const y = p.y - t.cy;
  return { x: t.cx + x * cos - y * sin + t.dx, y: t.cy + x * sin + y * cos + t.dy };
}

/** A rectangle's corners. */
export const corners = (r: Rect): Point[] => [
  { x: r.x, y: r.y },
  { x: r.x + r.width, y: r.y },
  { x: r.x + r.width, y: r.y + r.height },
  { x: r.x, y: r.y + r.height },
];

/** A growing bounding box. */
export class Bounds {
  private x1 = Infinity;
  private y1 = Infinity;
  private x2 = -Infinity;
  private y2 = -Infinity;

  point(p: Point, reach = 0): this {
    this.x1 = Math.min(this.x1, p.x - reach);
    this.y1 = Math.min(this.y1, p.y - reach);
    this.x2 = Math.max(this.x2, p.x + reach);
    this.y2 = Math.max(this.y2, p.y + reach);
    return this;
  }

  /** The rectangle as `transform` draws it. */
  rect(r: Rect, transform?: Transform): this {
    for (const c of corners(r)) this.point(apply(transform, c));
    return this;
  }

  get empty(): boolean {
    return this.x1 > this.x2;
  }

  /** The box grown by `pad` on every side; a point at the origin when nothing was added. */
  box(pad = 0): Rect {
    if (this.empty) return { x: -pad, y: -pad, width: 2 * pad, height: 2 * pad };
    return {
      x: this.x1 - pad,
      y: this.y1 - pad,
      width: this.x2 - this.x1 + 2 * pad,
      height: this.y2 - this.y1 + 2 * pad,
    };
  }
}
