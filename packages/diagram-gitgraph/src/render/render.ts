// Draws a laid-out git graph through the SvgWriter (DESIGN §7, spec #292 T4). The layout
// (`layoutGitGraph`) placed everything; this file only paints it, in v12's stacking order: the
// branch lanes (line, label box, name), the arrows, the commit bullets, the commit labels and
// tags, then the title. Each commit's bullet group carries its `data-id` (the commit id, which
// v12 wrote into the class list, R-SVG-2) and the `data-ast` of the statement that made it;
// each lane group its branch name and, for a `branch` statement, its `data-ast` (the implicit
// main branch has none). Labels, tags and arrows carry `data-id` only (pitfall 12). v12's
// class names stay where they still apply (`commit<n>`, `arrow<n>`, `branch<n>`, `label<n>`,
// `branch-label<n>`, `commit-label`, `tag-label`, …), with `<n>` the branch's slot (D267).
import type { RenderContext } from '@mermaid-js/core';
import {
  px,
  rotate,
  styleScope,
  styleText,
  themeStyleSheet,
  transforms,
  translate,
  type Attrs,
  type SvgWriter,
  type Transform as SvgTransform,
} from '@mermaid-js/core/svg';
import type {
  GitCommitLayout,
  GitLane,
  GitLayout,
  GitText,
  PathCommand,
  Transform,
} from '../layout/types.ts';
import type { GitModel } from '../model.ts';
import { paints, type Paints } from './paint.ts';

/** What the renderer reads from the render context. */
export type GitRenderContext = Pick<RenderContext, 'config' | 'theme' | 'idPrefix' | 'version'>;

interface Scene {
  readonly w: SvgWriter;
  readonly layout: GitLayout;
  readonly paint: Paints;
  /** The palette slot of each lane (D267). */
  readonly slots: readonly number[];
}

/**
 * v12 `drawCommitBullet`'s cherry-pick mark: two dots at (∓3, +2) from the centre and two
 * strokes from (±3, +1) up to (0, −5), in both geometries.
 */
const CHERRY = { dotX: 3, dotY: 2, stemX: 3, stemY: 1, tipY: 5 } as const;

/** v12 `getCommitClassType`. */
const TYPE_CLASS: Readonly<Record<GitCommitLayout['symbol'], string>> = {
  NORMAL: 'commit-normal',
  REVERSE: 'commit-reverse',
  HIGHLIGHT: 'commit-highlight',
  MERGE: 'commit-merge',
  CHERRY_PICK: 'commit-cherry-pick',
};

/** Writes the whole `<svg>` document for a laid-out git graph. */
export function renderGitGraph(
  model: GitModel,
  layout: GitLayout,
  ctx: GitRenderContext,
  w: SvgWriter
): void {
  const paint = paints(ctx, layout.title !== undefined);
  const scene: Scene = { w, layout, paint, slots: layout.lanes.map((l) => paint.slot(l.index)) };
  openRoot(model, layout, ctx, w);
  drawLanes(scene, model);
  drawArrows(scene);
  drawBullets(scene);
  drawLabels(scene);
  drawTitle(scene);
  w.close();
}

/** The `<svg>` root with its title and description (R-A11Y-1). */
function openRoot(model: GitModel, layout: GitLayout, ctx: GitRenderContext, w: SvgWriter): void {
  const { theme, config } = ctx;
  const prefix = ctx.idPrefix;
  const { x, y } = layout.bounds;
  const width = Math.max(1, Math.ceil(layout.bounds.width));
  const height = Math.max(1, Math.ceil(layout.bounds.height));
  const maxWidth = config.gitGraph?.useMaxWidth !== false;
  const title = model.accTitle.trim();
  const desc = model.accDescr.trim();
  // Read before the root style is written, so it declares their aliases.
  const font = theme.font();
  const fontSize = theme.length('fontSize');
  const auto = theme.autoDeclarations();
  w.open('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    class: 'mermaid mermaid-gitGraph',
    viewBox: [x, y, width, height],
    width: maxWidth ? '100%' : width,
    height: maxWidth ? undefined : height,
    role: 'img',
    'aria-roledescription': 'gitGraph',
    'aria-labelledby': title ? `${prefix}-title` : undefined,
    'aria-describedby': desc ? `${prefix}-desc` : undefined,
    'data-mermaid-version': ctx.version,
    'data-p': auto ? styleScope(prefix) : undefined,
    style: styleText(maxWidth ? { 'max-width': px(width) } : {}, theme.rootStyleText()),
    'font-family': font,
    'font-size': fontSize,
  });
  if (auto) w.styleSheet(themeStyleSheet(styleScope(prefix), auto.light, auto.dark));
  if (title) textElement(w, 'title', title, `${prefix}-title`);
  if (desc) textElement(w, 'desc', desc, `${prefix}-desc`);
}

function textElement(w: SvgWriter, tag: 'title' | 'desc', text: string, id: string): void {
  w.open(tag, { id });
  w.text(text);
  w.close();
}

/** SVG `translate(dx, dy) rotate(angle, cx, cy)`, as v12 wrote it. */
function transformOf(t: Transform | undefined): SvgTransform | undefined {
  if (!t) return undefined;
  const turn = rotate(t.angle, t.cx, t.cy);
  return t.dx === 0 && t.dy === 0 ? turn : transforms(translate(t.dx, t.dy), turn);
}

/** Plain text (D268), left-aligned where the layout put it, in the font it was measured in. */
function drawText(w: SvgWriter, t: GitText, attrs: Attrs): void {
  w.label(
    {
      lines: t.lines.map((text) => [{ text }]),
      lineHeight: t.lineHeight,
      height: t.height,
      baseline: t.baseline,
      left: true,
      width: t.width,
    },
    t.x + t.width / 2,
    t.y + t.height / 2,
    attrs
  );
}

/** v12 `drawBranches`: per lane its dashed line, the name's box and the name. */
function drawLanes(scene: Scene, model: GitModel): void {
  const { w } = scene;
  w.open('g', { class: 'branches' });
  for (const lane of scene.layout.lanes) {
    const slot = scene.slots[lane.index]!;
    w.open('g', {
      class: 'branch-lane',
      'data-id': lane.branch,
      'data-ast': model.branches[lane.index]?.astId,
    });
    drawLane(scene, lane, slot);
    w.close();
  }
  w.close();
}

function drawLane(scene: Scene, lane: GitLane, slot: number): void {
  const { w, paint, layout } = scene;
  const p = paint.lane(slot);
  if (lane.line)
    w.leaf('line', {
      class: `branch branch${slot}`,
      ...lane.line,
      stroke: paint.line.stroke,
      'stroke-width': layout.lineWidth,
      'stroke-dasharray': paint.line.dash,
    });
  const label = lane.label;
  if (!label) return;
  w.leaf('rect', {
    class: `branchLabelBkg label${slot}`,
    ...label.box,
    rx: label.radius || undefined,
    ry: label.radius || undefined,
    fill: p.box.fill,
    stroke: p.box.stroke,
    'stroke-width': p.box.stroke === undefined ? undefined : p.box.strokeWidth,
    filter: paint.boxFilter,
  });
  w.open('g', { class: 'branchLabel' });
  drawText(w, label.text, {
    class: `label branch-label${slot}`,
    fill: p.name,
    'font-weight': paint.weight,
  });
  w.close();
}

/** `d` for an arrow's commands (`A` is v12's `A r r, 0, 0, sweep, x y`). */
function arrowPath(w: SvgWriter, path: readonly PathCommand[]) {
  const b = w.path();
  for (const c of path) {
    if (c.op === 'A') b.arcTo(c.r, c.r, 0, false, c.sweep === 1, c.x, c.y);
    else if (c.op === 'M') b.moveTo(c.x, c.y);
    else b.lineTo(c.x, c.y);
  }
  return b.done();
}

/** v12 `drawArrows`: one per parent, in its lane's colour, round caps. */
function drawArrows(scene: Scene): void {
  const { w, paint, layout } = scene;
  w.open('g', { class: 'commit-arrows' });
  for (const a of layout.arrows) {
    const slot = scene.slots[a.lane]!;
    w.leaf('path', {
      class: `arrow arrow${slot}`,
      'data-id': `${a.from}>${a.to}`,
      d: arrowPath(w, a.path),
      fill: 'none',
      stroke: paint.lane(slot).ink,
      'stroke-width': layout.arrowWidth,
      'stroke-linecap': 'round',
    });
  }
  w.close();
}

/** v12 `drawCommitBullet`, one group per commit. */
function drawBullets(scene: Scene): void {
  const { w } = scene;
  w.open('g', { class: 'commit-bullets' });
  for (const c of scene.layout.commits) {
    w.open('g', {
      class: `commit-bullet ${TYPE_CLASS[c.symbol]}`,
      'data-id': c.id,
      'data-ast': c.ast,
    });
    drawBullet(scene, c);
    w.close();
  }
  w.close();
}

function drawBullet(scene: Scene, c: GitCommitLayout): void {
  const { w, paint } = scene;
  const slot = scene.slots[c.lane]!;
  const p = paint.lane(slot);
  const type = TYPE_CLASS[c.symbol];
  const { x, y, radius: r } = c;
  if (c.symbol === 'HIGHLIGHT') {
    w.leaf('rect', {
      class: `commit commit-highlight${slot} ${type}-outer`,
      x: x - r,
      y: y - r,
      width: 2 * r,
      height: 2 * r,
      ...p.highlight,
    });
    const s = paint.highlightInner;
    w.leaf('rect', {
      class: `commit commit${slot} ${type}-inner`,
      x: x - s / 2,
      y: y - s / 2,
      width: s,
      height: s,
      fill: paint.inset,
      stroke: paint.inset,
    });
    return;
  }
  if (c.symbol === 'CHERRY_PICK') {
    const { ink } = paint.cherry;
    w.leaf('circle', { class: `commit ${type}`, cx: x, cy: y, r, fill: paint.cherry.fill });
    for (const side of [-1, 1])
      w.leaf('circle', {
        class: `commit ${type}`,
        cx: x + side * CHERRY.dotX,
        cy: y + CHERRY.dotY,
        r: paint.cherryPickDot,
        fill: ink,
      });
    for (const side of [1, -1])
      w.leaf('line', {
        class: `commit ${type}`,
        x1: x + side * CHERRY.stemX,
        y1: y + CHERRY.stemY,
        x2: x,
        y2: y - CHERRY.tipY,
        stroke: ink,
      });
    return;
  }
  w.leaf('circle', { class: `commit commit${slot}`, cx: x, cy: y, r, fill: p.ink, stroke: p.ink });
  if (c.symbol === 'MERGE')
    w.leaf('circle', {
      class: `commit ${type} commit${slot}`,
      cx: x,
      cy: y,
      r: paint.mergeRadius,
      fill: paint.inset,
      stroke: paint.inset,
    });
  else if (c.symbol === 'REVERSE') {
    const k = paint.reverseCross;
    w.leaf('path', {
      class: `commit ${type} commit${slot}`,
      d: w
        .path()
        .moveTo(x - k, y - k)
        .lineTo(x + k, y + k)
        .moveTo(x - k, y + k)
        .lineTo(x + k, y - k)
        .done(),
      fill: 'none',
      stroke: paint.inset,
      'stroke-width': paint.crossWidth,
    });
  }
}

/** v12 `drawCommitLabel` and `drawCommitTags`: ids in their boxes, tags as flags. */
function drawLabels(scene: Scene): void {
  const { w, paint } = scene;
  const cl = paint.commitLabel;
  const tag = paint.tag;
  w.open('g', { class: 'commit-labels' });
  for (const c of scene.layout.commits) {
    if (c.label) {
      w.open('g', { 'data-id': c.id, transform: transformOf(c.label.transform) });
      w.leaf('rect', {
        class: 'commit-label-bkg',
        ...c.label.box,
        fill: cl.fill,
        opacity: cl.opacity,
      });
      drawText(w, c.label.text, {
        class: 'commit-label',
        fill: cl.text,
        'font-size': cl.size,
        'font-weight': paint.weight,
      });
      w.close();
    }
    for (const t of c.tags) {
      const transform = transformOf(t.transform);
      w.leaf('polygon', {
        class: 'tag-label-bkg',
        'data-id': c.id,
        points: t.points.flatMap((p) => [p.x, p.y]),
        fill: tag.fill,
        stroke: tag.stroke,
        filter: tag.filter,
        transform,
      });
      w.leaf('circle', {
        class: 'tag-hole',
        'data-id': c.id,
        cx: t.hole.x,
        cy: t.hole.y,
        r: t.hole.r,
        fill: tag.hole,
        transform,
      });
      drawText(w, t.text, {
        class: 'tag-label',
        'data-id': c.id,
        fill: tag.text,
        'font-size': tag.size,
        transform: transformOf(t.textTransform),
      });
    }
  }
  w.close();
}

/** The title (D265): v12 `insertTitle`'s `gitTitleText`, 18 px, where the layout put it. */
function drawTitle(scene: Scene): void {
  const t = scene.layout.title;
  if (!t) return;
  drawText(scene.w, t, {
    class: 'gitTitleText',
    fill: scene.paint.title,
    'font-size': t.font.size,
  });
}
