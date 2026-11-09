/**
 * Draws a laid-out ishikawa diagram through the SvgWriter (spec #519 T4, DESIGN §7). The layout
 * (`layoutIshikawa`) measured and placed everything in v12's coordinates; this file only paints
 * it, in v12's order and with v12's classes (`ishikawaRenderer.ts`): `g.ishikawa` holding
 * `line.ishikawa-spine`, `g.ishikawa-head-group` (`path.ishikawa-head`,
 * `text.ishikawa-head-label`), then one `g.ishikawa-pair` per two causes, each cause a
 * `line.ishikawa-branch`, its arrowhead, a `g.ishikawa-label-group` (`rect.ishikawa-label-box`,
 * `text.ishikawa-label.cause`) and one `g.ishikawa-sub-group` per sub-cause
 * (`line.ishikawa-sub-branch`, its arrowhead, `text.ishikawa-label` with `align`, `up` or
 * `down`). An empty body draws no group (v12 drew nothing).
 *
 * v12's `marker#ishikawa-arrow-<id>` is a filled triangle `path.ishikawa-arrow` at the start of
 * every branch and sub-branch, of the marker's size (the layout's `bone.arrow`). No `<style>`
 * (but `theme: 'auto'`'s), `<marker>`, `<defs>` or `foreignObject`; the only element id is
 * `<id>-title`. v12's style sheet becomes attributes from shared variables only (D152, D227):
 * lines, arrowheads and outlines `lineColor`, head and boxes filled `mainBkg`, text `textColor`,
 * the family `fontFamily` on the root; the head label 600 at 14 px, other labels the theme's
 * `fontSize` (D493, the layout's `fonts`).
 *
 * `data-ast` marks one element per AST node (D497, pitfall 12): the head group (the effect),
 * each cause's label group, each sub-cause's sub-group (a sub-cause has no label group). Bones,
 * arrowheads and text carry `data-id`, the node's AST id; the spine the effect's. The SVG
 * `<title>` is the front-matter `title`, else the effect's text as drawn, plain (entities
 * decoded, a line break a space) (D492); no title is drawn.
 *
 * Hand-drawn (D494): the head and the label boxes are `node` outlines, the spine and bones
 * `edge` outlines (`line`); the drawer sketches them with its role's options, as venn's (the
 * outline hook takes no per-call options, GAPS #583). Arrowheads and text are never outlines
 * (D302).
 */
import type { RenderContext } from '@mermaid-js/core';
import {
  px,
  styleScope,
  styleText,
  themeStyleSheet,
  type Attrs,
  type LabelBox,
  type Paint,
  type SafeValue,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import type {
  IshikawaBone,
  IshikawaCauseLayout,
  IshikawaHead,
  IshikawaLayout,
  IshikawaPairLayout,
  IshikawaSubCauseLayout,
  PlacedLabel,
  Segment,
} from '../layout/index.ts';
import type { IshikawaModel } from '../model.ts';

/** What the ishikawa renderer reads from the render context. */
export type IshikawaRenderContext = Pick<
  RenderContext,
  'config' | 'theme' | 'idPrefix' | 'version'
>;

/** The colours ishikawa draws with: v12's style sheet, shared variables only. */
interface Paints {
  /** Spine, bones, arrowheads and outlines. */
  readonly line: Paint;
  /** The head and the label boxes. */
  readonly fill: Paint;
  readonly text: Paint;
}

interface Scene {
  readonly w: SvgWriter;
  readonly layout: IshikawaLayout;
  readonly paint: Paints;
}

/** Writes the whole `<svg>` document for a laid-out ishikawa diagram. */
export function renderIshikawa(
  model: IshikawaModel,
  layout: IshikawaLayout,
  ctx: IshikawaRenderContext,
  w: SvgWriter
): void {
  // Every theme variable is read before the root, so its style declares them.
  const paint = paints(ctx.theme);
  const scene: Scene = { w, layout, paint };
  openRoot(model, scene, ctx);
  if (layout.head) {
    w.open('g', { class: 'ishikawa' });
    if (layout.spine) drawSpine(scene, layout.spine, layout.head);
    drawHead(scene, layout.head);
    for (const pair of layout.pairs) drawPair(scene, pair);
    w.close();
  }
  w.close();
}

/** v12 `ishikawaStyles.ts`'s colours. */
function paints(theme: RenderContext['theme']): Paints {
  return {
    line: theme.color('lineColor'),
    fill: theme.color('mainBkg'),
    text: theme.color('textColor'),
  };
}

/** The spine, from the last pair's start to the head's back. */
function drawSpine(
  scene: Scene,
  spine: NonNullable<IshikawaLayout['spine']>,
  head: IshikawaHead
): void {
  drawLine(scene, spine, 'ishikawa-spine', head.ast);
}

/** A spine or bone line as an edge outline (v12's style sheet: no fill). */
function drawLine(
  { w, paint }: Scene,
  line: Segment & { readonly stroke: number },
  cls: string,
  id: string
): void {
  w.outline('edge', 'line', {
    class: cls,
    'data-id': id,
    x1: line.x1,
    y1: line.y1,
    x2: line.x2,
    y2: line.y2,
    fill: 'none',
    stroke: paint.line,
    'stroke-width': line.stroke,
  });
}

/** `g.ishikawa-head-group`: the head's outline (`M top L bottom Q control top Z`), then its label. */
function drawHead({ w, layout, paint }: Scene, head: IshikawaHead): void {
  w.open('g', { class: 'ishikawa-head-group', 'data-ast': head.ast });
  const { top, bottom, control } = head;
  w.outline('node', 'path', {
    class: 'ishikawa-head',
    d: w
      .path()
      .moveTo(top.x, top.y)
      .lineTo(bottom.x, bottom.y)
      .quadTo(control.x, control.y, top.x, top.y)
      .close()
      .done(),
    fill: paint.fill,
    stroke: paint.line,
    'stroke-width': head.stroke,
  });
  label(w, head.label, {
    class: 'ishikawa-head-label',
    'data-id': head.ast,
    fill: paint.text,
    'font-size': layout.fonts.head.size,
    'font-weight': String(layout.fonts.head.weight) as SafeValue,
  });
  w.close();
}

/** `g.ishikawa-pair`: the upper cause, then the lower one. */
function drawPair(scene: Scene, pair: IshikawaPairLayout): void {
  scene.w.open('g', { class: 'ishikawa-pair' });
  for (const cause of pair.causes) drawCause(scene, cause);
  scene.w.close();
}

/** A cause's bone and arrowhead, its boxed label, then each sub-cause (v12 `drawBranch`). */
function drawCause(scene: Scene, cause: IshikawaCauseLayout): void {
  const { w, layout, paint } = scene;
  drawBone(scene, cause.bone, 'ishikawa-branch', cause.ast);
  w.open('g', { class: 'ishikawa-label-group', 'data-ast': cause.ast });
  w.outline('node', 'rect', {
    class: 'ishikawa-label-box',
    x: cause.box.x,
    y: cause.box.y,
    width: cause.box.width,
    height: cause.box.height,
    fill: paint.fill,
    stroke: paint.line,
    'stroke-width': cause.boxStroke,
  });
  label(w, cause.label, {
    class: 'ishikawa-label cause',
    'data-id': cause.ast,
    fill: paint.text,
    'font-size': layout.fonts.label.size,
  });
  w.close();
  for (const sub of cause.subCauses) drawSubCause(scene, sub);
}

/** `g.ishikawa-sub-group`: a sub-cause's bone, arrowhead and end-anchored label. */
function drawSubCause(scene: Scene, sub: IshikawaSubCauseLayout): void {
  const { w, layout, paint } = scene;
  w.open('g', { class: 'ishikawa-sub-group', 'data-ast': sub.ast });
  drawBone(scene, sub.bone, 'ishikawa-sub-branch', sub.ast);
  label(
    w,
    sub.label,
    {
      class: `ishikawa-label ${sub.kind}`,
      'data-id': sub.ast,
      fill: paint.text,
      'font-size': layout.fonts.label.size,
    },
    endAligned(sub.label.text)
  );
  w.close();
}

/** A bone as an edge outline, then its arrowhead: a filled triangle, never an outline (D302). */
function drawBone(scene: Scene, bone: IshikawaBone, cls: string, ast: string): void {
  const { w, paint } = scene;
  drawLine(scene, bone, cls, ast);
  const { tip, left, right } = bone.arrow;
  // A bone of no length has no direction, so no arrowhead (v12's marker drew none either).
  if (tip.x === left.x && tip.y === left.y) return;
  w.leaf('path', {
    class: 'ishikawa-arrow',
    'data-id': ast,
    d: w.path().moveTo(tip.x, tip.y).lineTo(left.x, left.y).lineTo(right.x, right.y).close().done(),
    fill: paint.line,
  });
}

/**
 * A sub-cause's lines right-aligned in their box, as v12's end-anchored `tspan`s: each line moved
 * right by what it lacks of the widest.
 */
function endAligned(text: PlacedLabel['text']): LabelBox {
  return {
    ...text,
    left: true,
    indents: text.widths.map((width, i) => (text.indents[i] ?? 0) + text.width - width),
  };
}

/** A placed label, centred in its box, its lines laid out as `box` (default: its own). */
function label(w: SvgWriter, p: PlacedLabel, attrs: Attrs, box: LabelBox = p.text): void {
  w.label(box, p.x + p.width / 2, p.y + p.height / 2, attrs);
}

/**
 * A label's text as plain text, for the accessible name: its lines as drawn (entities decoded,
 * markup gone), joined by a space, so a `<br>` or a wrap reads as one.
 */
function plainText(p: PlacedLabel): string {
  return p.text.lines
    .map((line) => line.map((span) => span.text).join(''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The `<svg>` root with its title (R-A11Y-1, D133, D492). */
function openRoot(model: IshikawaModel, { w, layout }: Scene, ctx: IshikawaRenderContext): void {
  const { theme, config } = ctx;
  const prefix = ctx.idPrefix;
  const { x, y } = layout.bounds;
  const width = Math.max(1, Math.ceil(layout.bounds.width));
  const height = Math.max(1, Math.ceil(layout.bounds.height));
  // v12's runtime default is true (spec #519 §Integration), whatever its schema said.
  const maxWidth =
    (config.ishikawa as { useMaxWidth?: unknown } | undefined)?.useMaxWidth !== false;
  const title = model.title?.trim() || (layout.head && plainText(layout.head.label));
  // Read before the root style is written, so it declares its alias.
  const font = theme.font();
  const auto = theme.autoDeclarations();
  w.open('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    class: 'mermaid mermaid-ishikawa',
    viewBox: [x, y, width, height],
    width: maxWidth ? '100%' : width,
    height: maxWidth ? undefined : height,
    role: 'img',
    'aria-roledescription': 'ishikawa',
    'aria-labelledby': title ? `${prefix}-title` : undefined,
    'data-mermaid-version': ctx.version,
    'data-p': auto ? styleScope(prefix) : undefined,
    style: styleText(maxWidth ? { 'max-width': px(width) } : {}, theme.rootStyleText()),
    'font-family': font,
  });
  if (auto) w.styleSheet(themeStyleSheet(styleScope(prefix), auto.light, auto.dark));
  if (title) {
    w.open('title', { id: `${prefix}-title` });
    w.text(title);
    w.close();
  }
}
