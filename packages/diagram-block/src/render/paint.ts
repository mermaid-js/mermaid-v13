/**
 * Every paint a block render uses, read from the theme before the root is written, so the
 * root's `style` declares exactly the aliases the body refers to (`theme.rootStyleText()`).
 *
 * Block's theme table holds one flag (`blockCompositeClusterPaint`, #771); every colour is a
 * shared row v12's `styles.ts` read, by name, and never a theme name or `look` (D152, D153). The redux and `neo`
 * families carry v12 neo's gradient (D182) and drop shadow, which go on every block's outline
 * (leaves, block arrows and composites), not on edges or labels (D227).
 */
import type { Warning } from '@mermaid-js/core';
import type { CheckedStyle, OutlinePaint, Paint } from '@mermaid-js/core/svg';
import { paletteSlots, styleCache, type PaletteTint } from '@mermaid-js/shared/svg/document';
import type { Theme } from '@mermaid-js/core/theme';
import { isComposite, type Block, type BlockModel } from '../model.ts';
import { arrowheads, type Arrowheads } from '@mermaid-js/shared/svg/arrowheads';
import { BLOCK_RENDER } from './metrics.ts';

type Length = ReturnType<Theme['length']>;
type Font = ReturnType<Theme['font']>;
type Filter = ReturnType<Theme['filter']>;

/** The paint of every block's outline and label. */
export interface NodePaint {
  readonly fill: Paint;
  /** `nodeBorder`, or the theme's gradient where `useGradient` is on (D182). */
  readonly stroke: OutlinePaint;
  readonly strokeWidth: Length;
  /** `nodeTextColor`: v12's `.label` rule, on leaves', composites' and edges' labels alike. */
  readonly text: Paint;
  /** `dropShadow` as a CSS filter; undefined where the theme has none (the classic themes). */
  readonly shadow: Filter | undefined;
  /** `doubleCircleGap`: the double circle's inner ring is this far inside its outline. */
  readonly ringGap: number;
}

/** The edges' paint (v12's `.flowchart-link`, `.marker` and `.edgeLabel` rules). */
export interface EdgePaint {
  readonly line: Paint;
  /** A normal edge's width (`strokeWidth`, v12's `edge-thickness-normal`). */
  readonly width: Length;
  /** A thick edge's (v12's `edge-thickness-thick`). */
  readonly thickWidth: number;
  /** `arrowheadColor`, as flowchart v13 (v12 block's markers took `lineColor`). */
  readonly arrow: Paint;
  readonly heads: Arrowheads;
  /** `edgeLabelBackground`. */
  readonly labelFill: Paint;
  /** `nodeTextColor`: v12's `.label` and `span` rules reached edge labels too. */
  readonly labelText: Paint;
}

/**
 * A composite's paint where the theme carries no composite palette: v12's `.node .cluster`
 * rule, `fade(clusterBkg, 0.5)` and `fade(clusterBorder, 0.2)`, as the variable and an opacity
 * (#771). Its label keeps `nodeTextColor`: v12's label is a `g.label` beside the rect, which
 * the `.cluster text` rule does not reach.
 */
export interface CompositePaint {
  readonly fill: Paint;
  readonly fillOpacity: number;
  /** `clusterBorder`, or the theme's gradient where `useGradient` is on (D182). */
  readonly stroke: OutlinePaint;
  /** Undefined on the gradient, which v12 neo drew unfaded. */
  readonly strokeOpacity: number | undefined;
}

export interface Paints {
  readonly font: Font;
  readonly fontSize: Length;
  readonly node: NodePaint;
  readonly edge: EdgePaint;
  /** A composite's palette slot from its `colorIndex`, or undefined with no palette. */
  readonly slotOf: (colorIndex: number | undefined) => PaletteTint | undefined;
  /**
   * The paint of a composite without a palette slot; undefined where the theme carries a
   * palette or turns `blockCompositeClusterPaint` off, or the diagram has no composite, so no
   * cluster variable reaches the root's style.
   */
  readonly composite: CompositePaint | undefined;
  /** A block's checked `classDef` and `style` declarations (R-SEC-3), one check per list. */
  readonly styleOf: (block: Block) => CheckedStyle;
}

/** Whether `model` has a composite, without recursion (composites nest thousands deep). */
function hasComposite(model: BlockModel): boolean {
  const stack: Block[] = [...model.blocks];
  while (stack.length > 0) {
    const b = stack.pop()!;
    if (isComposite(b)) return true;
    for (const c of b.children) stack.push(c);
  }
  return false;
}

/**
 * The composites' paint where the theme has no composite palette and turns
 * `blockCompositeClusterPaint` on (#771, the classic family): decided by the variables, never
 * by theme name (D152). Off (the redux and neo families), a composite keeps the leaves' paint,
 * as v12 `look: neo` drew it.
 */
function compositePaint(theme: Theme, model: BlockModel): CompositePaint | undefined {
  if (theme.value('blockCompositeClusterPaint') !== 'true') return undefined;
  if (theme.palette('borderColorArray').length > 0 || !hasComposite(model)) return undefined;
  return {
    fill: theme.color('clusterBkg'),
    fillOpacity: BLOCK_RENDER.compositeFillOpacity,
    stroke: theme.outline('clusterBorder'),
    strokeOpacity: theme.gradient() ? undefined : BLOCK_RENDER.compositeStrokeOpacity,
  };
}

/** Reads every paint a render uses from `theme`. */
export function paints(theme: Theme, model: BlockModel, warn: (w: Warning) => void): Paints {
  const font = theme.font();
  const fontSize = theme.length('fontSize');
  const node: NodePaint = {
    fill: theme.color('mainBkg'),
    stroke: theme.outline('nodeBorder'),
    strokeWidth: theme.length('strokeWidth'),
    text: theme.color('nodeTextColor'),
    shadow: theme.value('dropShadow') === 'none' ? undefined : theme.filter('dropShadow'),
    ringGap: theme.number('doubleCircleGap'),
  };
  const edge: EdgePaint = {
    line: theme.color('lineColor'),
    width: node.strokeWidth,
    thickWidth: BLOCK_RENDER.thickEdge,
    arrow: theme.color('arrowheadColor'),
    heads: arrowheads(theme),
    labelFill: theme.color('edgeLabelBackground'),
    labelText: node.text,
  };
  // v12 `genColor`: the fill is the slot's, not the order's, when the arrays differ.
  const slot = paletteSlots(theme, 'slot');
  // `styles` only: v12's `textStyles` rewrote `color` as `fill` for its CSS, and `checkStyle`
  // already sends `color` to the label.
  const styleOf = styleCache(new Map(model.classDefs.map((c) => [c.id, c.styles])), warn);
  return {
    font,
    fontSize,
    node,
    edge,
    slotOf: (order) => (order === undefined ? undefined : slot(order)),
    composite: compositePaint(theme, model),
    styleOf: (block) => styleOf(block.classes, block.styles),
  };
}
