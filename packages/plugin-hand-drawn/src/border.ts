/**
 * The sketch outline v12 gave mindmap nodes (D693, #1256). v12 sketched every shaped mindmap
 * node with `userNodeOverrides`, whose stroke falls back to `nodeBorder` when the node has no
 * style of its own; a mindmap node never had one, so every sketch had a `nodeBorder` outline.
 * v13's mindmap draws a node with no stroke where the theme draws no outline (the classic
 * families), so the sketch adds it here, in the plugin, as v12's sketch did: only for a mindmap
 * node that has a fill and no `stroke` at all, and not for the plain node, which v12 did not
 * sketch (D308). A node with a stroke, as in the redux and neo families, keeps its own.
 */
import type { HookContext } from '@mermaid-js/core';
import type { Attrs, OutlineRole } from '@mermaid-js/core/svg';

/**
 * The class mindmap gives its plain node's outline (`node-bkg node-default`). Where a theme
 * turns on `mindmapRoundedNodes` the plain node is drawn `node-rounded` and gets the outline;
 * no classic theme does, and v12 had no such combination (D693).
 */
const PLAIN = 'node-default';
/** v12 `userNodeOverrides`: the sketch's stroke width when the node has none of its own. */
const V12_STROKE_WIDTH = 1.3;

/** What the outline needs from the hook context: the diagram id and the render's theme. */
export type BorderContext = Pick<HookContext, 'diagram' | 'theme'>;

const isPlain = (attrs: Attrs): boolean =>
  String(attrs.class ?? '')
    .split(/\s+/)
    .includes(PLAIN);

/** Whether a sketched mindmap may need the outline: the theme draws none of its own. */
const needsBorder = (ctx: BorderContext): boolean =>
  ctx.diagram === 'mindmap' && ctx.theme.value('mindmapOutlinedNodes') !== 'true';

/**
 * Reads `nodeBorder` before the diagram is drawn (from `postLayout`), so the root `style`
 * declares its alias: the root is written before any outline, and a variable first read in
 * `draw` would leave `var(--_nb)` undeclared. Only where an outline may be drawn, so other
 * diagrams and themes keep their root as it was. Core picks the active outline drawer only when
 * the first outline is drawn, after the root, so this cannot ask whether this plugin's drawer is
 * the one: with another outline extension registered first, the alias is declared and unused.
 */
export function declareNodeBorder(ctx: BorderContext): void {
  if (needsBorder(ctx)) ctx.theme.color('nodeBorder');
}

/** `attrs` with v12's `nodeBorder` sketch outline where D693 gives one, else `attrs` itself. */
export function withNodeBorder(role: OutlineRole, attrs: Attrs, ctx: BorderContext): Attrs {
  if (role !== 'node' || !needsBorder(ctx)) return attrs;
  if (attrs.stroke !== undefined || attrs.fill === undefined || attrs.fill === 'none') return attrs;
  if (isPlain(attrs)) return attrs;
  return {
    ...attrs,
    stroke: ctx.theme.color('nodeBorder'),
    'stroke-width': attrs['stroke-width'] ?? V12_STROKE_WIDTH,
  };
}
