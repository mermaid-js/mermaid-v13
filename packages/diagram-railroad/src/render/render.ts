// Draws a laid-out railroad diagram through the SvgWriter (spec #526 T4, D215, D227). The layout
// (`layoutRailroad`) placed everything as v12's nested groups; this file only paints it, with
// v12's class names and DOM order (`railroadRenderer.ts`): per rule a `g.railroad-rule` at its
// origin holding the definition's `g` (at the definition's offset) with the expression groups
// `g.railroad-<kind>` inside it, then `g.railroad-rule-name-group > text.railroad-rule-name`,
// `g.railroad-start > circle`, `g.railroad-end > circle` and the lead-in and lead-out
// `path.railroad-line`. An expression writes its children (each at its `translate`), then its
// own track paths, or its box and text. Each rule and expression `g` carries its `data-ast`
// and `data-id`, its AST id (D517); each text carries the AST id of what it labels as `data-id`
// only (pitfall 12). Children and paths interleave as v12 appended them (`pathsAfter`).
//
// v12 styled everything from one `<style>` (`styles.ts`); v13 writes no style sheet but `auto`'s
// (R-SEC-2), so each element carries v12's computed values as presentation attributes. What
// every element shares (the stroke width, the font family and size) is written once on the root.
import type { RenderContext } from '@mermaid-js/core';
import { num, translate, type SafeValue, type SvgWriter } from '@mermaid-js/core/svg';
import { openSvgRoot } from '@mermaid-js/shared/svg/document';
import {
  keepsSpaces,
  type PlacedText,
  type RailroadExpressionLayout,
  type RailroadLayout,
  type RailroadRuleLayout,
  type TrackPath,
} from '../layout/index.ts';
import type { RailroadModel } from '../model.ts';
import { BOX_PAINT, paints, type Paints } from './paint.ts';

/** What the renderer reads from the render context (the config through `layout.config`). */
export type RailroadRenderContext = Pick<RenderContext, 'theme' | 'idPrefix' | 'version'>;

/** What drawing a rule needs, besides the rule. */
interface Parts {
  readonly paint: Paints;
  readonly w: SvgWriter;
}

/** Writes the whole `<svg>` document for a laid-out railroad diagram. */
export function renderRailroad(
  model: RailroadModel,
  layout: RailroadLayout,
  ctx: RailroadRenderContext,
  w: SvgWriter
): void {
  const parts: Parts = { paint: paints(ctx.theme, layout), w };
  openRoot(model, layout, ctx, w);
  for (const rule of layout.rules) drawRule(parts, rule);
  w.close();
}

/** One rule: v12's `renderRule` (`railroadRenderer.ts:534-604`). */
function drawRule(parts: Parts, rule: RailroadRuleLayout): void {
  const { paint, w } = parts;
  w.open('g', {
    class: 'railroad-rule',
    'data-id': rule.ast,
    'data-ast': rule.ast,
    transform: translate(rule.origin.x, rule.origin.y),
  });
  const def = rule.definition;
  w.open('g', { transform: translate(def.x, def.y) });
  drawExpression(parts, def, false);
  w.close();
  w.open('g', { class: 'railroad-rule-name-group' });
  drawText(w, rule.label, rule.ast, {
    class: 'railroad-rule-name',
    'font-weight': 'bold',
    fill: paint.get('ruleNameColor'),
  });
  w.close();
  for (const [cls, m] of [
    ['railroad-start', rule.start],
    ['railroad-end', rule.end],
  ] as const) {
    w.open('g', { class: cls });
    w.leaf('circle', { cx: m.cx, cy: m.cy, r: m.r, fill: paint.get('markerFill') });
    w.close();
  }
  drawTrack(parts, rule.leadIn);
  drawTrack(parts, rule.leadOut);
  w.close();
}

/**
 * One expression, `g.railroad-<kind>`: translated within its parent, except the definition's,
 * whose wrapping `g` carries the offset (v12 `renderRule`). Its children and paths in v12's
 * order: each child, then the paths that follow it (`pathsAfter`), then any left.
 */
function drawExpression(parts: Parts, e: RailroadExpressionLayout, translated = true): void {
  const { paint, w } = parts;
  w.open('g', {
    class: `railroad-${e.kind}`,
    'data-id': e.ast,
    'data-ast': e.ast,
    transform: translated ? translate(e.x, e.y) : undefined,
  });
  let next = 0;
  e.children.forEach((c, i) => {
    drawExpression(parts, c);
    for (const end = next + (e.pathsAfter[i] ?? 0); next < end; next++)
      drawTrack(parts, e.paths[next]!);
  });
  for (; next < e.paths.length; next++) drawTrack(parts, e.paths[next]!);
  const keys = BOX_PAINT[e.kind];
  if (e.box && e.text && keys) {
    const { box } = e;
    w.leaf('rect', {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      rx: box.cornerRadius > 0 ? box.cornerRadius : undefined,
      ry: box.cornerRadius > 0 ? box.cornerRadius : undefined,
      fill: paint.get(keys.fill),
      stroke: paint.get(keys.stroke),
      'stroke-dasharray': box.dash ? (box.dash.map(num).join(',') as SafeValue) : undefined,
    });
    // A terminal is drawn with the spaces it was measured with (#774).
    const literal = e.kind === 'terminal' && keepsSpaces(e.text.text);
    drawText(w, e.text, e.ast, {
      fill: paint.get(keys.text),
      'xml:space': literal ? 'preserve' : undefined,
    });
  }
  w.close();
}

/** A text on its anchor: a box's centred both ways (v12's CSS), a rule name on its baseline. */
function drawText(
  w: SvgWriter,
  t: PlacedText,
  id: string,
  attrs: Parameters<SvgWriter['open']>[1]
): void {
  const centred = t.anchor === 'middle';
  w.open('text', {
    ...attrs,
    'data-id': id,
    x: t.x,
    y: t.y,
    'text-anchor': centred ? 'middle' : undefined,
    'dominant-baseline': centred ? 'middle' : undefined,
  });
  w.text(t.text);
  w.close();
}

/** One `path.railroad-line`: `M`, then `L` and quarter-circle `A` segments. */
function drawTrack({ paint, w }: Parts, track: TrackPath): void {
  const d = w.path().moveTo(track.start.x, track.start.y);
  for (const s of track.segments) {
    if (s.kind === 'line') d.lineTo(s.x, s.y);
    else d.arcTo(s.radius, s.radius, 0, false, s.sweep, s.x, s.y);
  }
  w.leaf('path', {
    class: 'railroad-line',
    d: d.done(),
    fill: 'none',
    stroke: paint.get('lineColor'),
  });
}

/** The `<svg>` root with its title and description (R-A11Y-1, D133); v12's diagram title is not drawn (D218). */
function openRoot(
  model: RailroadModel,
  layout: RailroadLayout,
  ctx: RailroadRenderContext,
  w: SvgWriter
): void {
  const { theme } = ctx;
  const { font, useMaxWidth: maxWidth } = layout.config;
  const { x, y, width, height } = layout.bounds;
  // The config's family and size where usable, else the theme's variables, so a host's
  // `--mermaid-fontFamily` and `--mermaid-fontSize` reach them (read before the root style is
  // written, so it declares their aliases).
  const family = font.family ?? theme.font();
  const size = font.size ?? theme.length('fontSize');
  openSvgRoot(w, ctx, {
    name: 'railroad railroad-diagram',
    roleDescription: model.notation,
    viewBox: [x, y, width, height],
    maxWidth,
    title: model.accTitle,
    desc: model.accDescr,
    attrs: {
      'font-family': family,
      'font-size': size,
      'stroke-width': layout.config.lengths.strokeWidth,
    },
  });
}
