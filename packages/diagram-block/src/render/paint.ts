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
import { checkStyle, type CheckedStyle, type OutlinePaint, type Paint } from '@mermaid-js/core/svg';
import type { Theme } from '@mermaid-js/core/theme';
import type { BlockLayout } from '../layout/types.ts';
import type { Block, BlockModel } from '../model.ts';
import { arrowheads, type Arrowheads } from './arrowheads.ts';

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

/** The edges' paint, read only when the diagram has an edge. */
export interface EdgePaint {
  readonly line: Paint;
  readonly arrow: Paint;
  readonly heads: Arrowheads;
  /** `edgeLabelBackground`, read only when an edge has a label. */
  readonly labelFill?: Paint;
}

export interface Paints {
  readonly font: Font;
  readonly fontSize: Length;
  readonly node: NodePaint;
  readonly edge?: EdgePaint;
  /** A composite's palette slot from its `colorIndex`, or undefined with no palette. */
  readonly slotOf: (colorIndex: number | undefined) => Tint | undefined;
  /** A block's checked `classDef` and `style` declarations (R-SEC-3), one check per list. */
  readonly styleOf: (block: Block) => CheckedStyle;
}

/**
 * The composite palette (v12 `genColor`), copied from flowchart's `paletteSlots()`: on wherever
 * the theme carries a non-empty `borderColorArray` (never by theme name, D152), the slot the
 * composite's declaration order modulo the palette; the fill from `bkgColorArray` only when that
 * is not empty, so `redux-dark-color` colours borders only.
 */
function paletteSlots(theme: Theme): Paints['slotOf'] {
  const border = theme.palette('borderColorArray');
  const bkg = theme.palette('bkgColorArray');
  return (order) => {
    if (order === undefined || border.length === 0) return undefined;
    const slot = order % border.length;
    return {
      id: `color-${slot}`,
      stroke: border[slot]!,
      fill: bkg.length > 0 ? bkg[order % bkg.length] : undefined,
    };
  };
}

/**
 * Each block's style, as flowchart v13 resolves it: its classes' declarations (each `class`
 * statement's text looked up as one name, as v12 did and the layout measured), then its own
 * `style`, checked once per distinct list (a class's `color` reaches the label); a dropped
 * declaration warns.
 */
function styleCache(model: BlockModel, warn: (w: Warning) => void): Paints['styleOf'] {
  const classDefs = new Map<string, readonly string[]>();
  // `styles` only: v12's `textStyles` rewrote `color` as `fill` for its CSS, and `checkStyle`
  // already sends `color` to the label.
  for (const c of model.classDefs) classDefs.set(c.id, c.styles);
  const checked = new Map<string, CheckedStyle>();
  return (block) => {
    const decls: string[] = [];
    for (const name of block.classes)
      for (const s of classDefs.get(name) ?? []) decls.push(s.trim());
    for (const s of block.styles) decls.push(s.trim());
    const key = decls.join(';');
    let style = checked.get(key);
    if (!style) checked.set(key, (style = checkStyle(decls, warn)));
    return style;
  };
}

/** Reads every paint `layout` needs from `theme`. */
export function paints(
  theme: Theme,
  model: BlockModel,
  layout: BlockLayout,
  warn: (w: Warning) => void
): Paints {
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
  const edge: EdgePaint | undefined =
    layout.edges.length > 0
      ? {
          line: theme.color('lineColor'),
          arrow: theme.color('arrowheadColor'),
          heads: arrowheads(theme),
          ...(layout.edges.some((e) => e.label)
            ? { labelFill: theme.color('edgeLabelBackground') }
            : {}),
        }
      : undefined;
  return {
    font,
    fontSize,
    node,
    ...(edge ? { edge } : {}),
    slotOf: paletteSlots(theme),
    styleOf: styleCache(model, warn),
  };
}
