/**
 * The node paint of the flow family (flowchart and agentflow): every vertex outline, its inner
 * lines, and the edges' lines and heads, from the same theme variables in the same order, so
 * the root `style` declares the aliases in that order (`theme.rootStyle()`).
 */
import type { Attrs, OutlinePaint } from '@mermaid-js/core/svg';
import type { Theme } from '@mermaid-js/core/theme';

/** Node paint: every vertex, and the edges' lines and heads. */
export interface NodePaint {
  readonly font: ReturnType<Theme['font']>;
  readonly fontSize: ReturnType<Theme['length']>;
  readonly fill: ReturnType<Theme['color']>;
  /** The outline: the theme's gradient when `useGradient` is on (D182), else nodeBorder. */
  readonly stroke: OutlinePaint;
  /**
   * nodeBorder as a colour where the outline is the gradient: a filled part's fill (a dot,
   * the fork bar), and a one-segment inner line, whose bounding box has no width or height
   * (the diagram's `usesPlain`, D185). Set only when the gradient is on and such a shape is
   * drawn.
   */
  readonly plainStroke: ReturnType<Theme['color']> | undefined;
  readonly text: ReturnType<Theme['color']>;
  readonly strokeWidth: ReturnType<Theme['length']>;
  readonly line: ReturnType<Theme['color']>;
  readonly arrow: ReturnType<Theme['color']>;
  /**
   * The theme's drop shadow (#85), a CSS filter on node outlines, icons, frames and the
   * collapsed card; never on edges, labels or a collapsed card's dots. A theme with `none` (the
   * classic themes) writes no filter at all.
   */
  readonly shadow: ReturnType<Theme['filter']> | undefined;
}

/**
 * The node paint of one render. `plainShapes` says whether a shape that needs
 * {@link NodePaint.plainStroke} is drawn; it is asked only when the theme has a gradient.
 */
export function nodePaint(theme: Theme, plainShapes: () => boolean): NodePaint {
  return {
    font: theme.font(),
    fontSize: theme.length('fontSize'),
    fill: theme.color('mainBkg'),
    stroke: theme.outline('nodeBorder'),
    plainStroke: theme.gradient() && plainShapes() ? theme.color('nodeBorder') : undefined,
    text: theme.color('nodeTextColor'),
    strokeWidth: theme.length('strokeWidth'),
    line: theme.color('lineColor'),
    arrow: theme.color('arrowheadColor'),
    shadow: theme.value('dropShadow') === 'none' ? undefined : theme.filter('dropShadow'),
  };
}

/**
 * An inner line's paint, with the gradient stroke it took from the outline swapped for
 * {@link NodePaint.plainStroke} on a shape that uses it (`plain`, D185).
 */
export function plainLine(node: NodePaint, line: Attrs, plain: boolean): Attrs {
  return node.plainStroke && line.stroke === node.stroke && plain
    ? { ...line, stroke: node.plainStroke }
    : line;
}
