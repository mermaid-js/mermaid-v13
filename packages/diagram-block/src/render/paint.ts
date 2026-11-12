/**
 * Every paint a block render uses, read from the theme before the root is written, so the
 * root's `style` declares exactly the aliases the body refers to (`theme.rootStyleText()`).
 *
 * Block has no theme table (spec #521, "No theme table"): it reads the shared rows v12's
 * `styles.ts` read, by name, and never a theme name or `look` (D152, D153). The redux and `neo`
 * families carry v12 neo's gradient (D182) and drop shadow, which go on every block's outline
 * (leaves, block arrows and composites), not on edges or labels (D227).
 */
import type { Warning } from '@mermaid-js/core';
import type { CheckedStyle, OutlinePaint, Paint } from '@mermaid-js/core/svg';
import { paletteSlots, styleCache } from '@mermaid-js/shared/svg/document';
import type { Theme } from '@mermaid-js/core/theme';
import type { Block, BlockModel } from '../model.ts';
import { arrowheads, type Arrowheads } from '@mermaid-js/shared/svg/arrowheads';
import { BLOCK_RENDER } from './metrics.ts';

type Length = ReturnType<Theme['length']>;
type Font = ReturnType<Theme['font']>;
type Filter = ReturnType<Theme['filter']>;

/** A composite's palette slot (v12 `genColor`): its `data-color-id` and colours. */
export interface Tint {
  readonly id: `color-${number}`;
  readonly stroke: Paint;
  readonly fill?: Paint;
}

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

export interface Paints {
  readonly font: Font;
  readonly fontSize: Length;
  readonly node: NodePaint;
  readonly edge: EdgePaint;
  /** A composite's palette slot from its `colorIndex`, or undefined with no palette. */
  readonly slotOf: (colorIndex: number | undefined) => Tint | undefined;
  /** A block's checked `classDef` and `style` declarations (R-SEC-3), one check per list. */
  readonly styleOf: (block: Block) => CheckedStyle;
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
    styleOf: (block) => styleOf(block.classes, block.styles),
  };
}
