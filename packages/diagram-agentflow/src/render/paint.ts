/**
 * Every theme variable the renderer reads, looked up once before the root is written, so the
 * root `style` declares exactly the aliases used (`theme.rootStyle()`). The paints follow what
 * v12.2.0 drew (its computed styles, pitfall 17): vertices, the collapsed card and a flow's frame
 * stroke `nodeBorder` (the neo gradient where the theme has one, D182) and carry the theme's
 * shadow; a frame is 0.75 px and unfilled; under a palette, vertices take their kind's slot and
 * frames and cards their flow's (`slots.ts`). The card's separator is `flowContainerStroke` and
 * its dots `nodeBorder` in every theme, the palette's included.
 */
import type { OutlinePaint } from '@mermaid-js/core/svg';
import type { AgentflowPrepared } from '../layout/index.ts';
import type { AgentflowRenderContext } from './context.ts';
import { arrowheads, type Arrowheads } from './edges.ts';
import { usesPlain } from './shapes.ts';
import type { Palette } from './slots.ts';

type ThemeOf = AgentflowRenderContext['theme'];
type Color = ReturnType<ThemeOf['color']>;
type Length = ReturnType<ThemeOf['length']>;

/** Vertex and card outlines, and the edges' lines and heads. */
export interface NodePaint {
  readonly font: ReturnType<ThemeOf['font']>;
  readonly fontSize: Length;
  readonly fill: Color;
  /** The outline: the theme's gradient when `useGradient` is on (D182), else nodeBorder. */
  readonly stroke: OutlinePaint;
  /** nodeBorder as a colour, for the refdoc's rule under the gradient (D185). */
  readonly plainStroke: Color | undefined;
  readonly text: Color;
  readonly strokeWidth: Length;
  readonly line: Color;
  readonly arrow: Color;
  /** The theme's drop shadow (`dropShadow`), on outlines and frames; none in classic themes. */
  readonly shadow: ReturnType<ThemeOf['filter']> | undefined;
}

export interface Paints {
  readonly heads: Arrowheads;
  readonly node: NodePaint;
  /** A flow's frame (`nodeBorder` stroke, as v12's neo rule drew it) and its title. */
  readonly frame?: { readonly stroke: OutlinePaint; readonly text: Color };
  /** A collapsed card's separator (`flowContainerStroke`) and dots (`nodeBorder`). */
  readonly card?: { readonly separator: Color; readonly dots: Color };
  /** Per-item colour, when the theme carries a non-empty `borderColorArray` (D152). */
  readonly palette?: Palette;
  readonly edgeLabel?: { readonly fill: Color; readonly text: Color };
  /** The front-matter title (D218): `textColor`. */
  readonly title?: Color;
}

/** The paints of one render, in the order their aliases are declared. */
export function paints(theme: ThemeOf, prepared: AgentflowPrepared, titled: boolean): Paints {
  const heads = arrowheads(theme);
  const node: NodePaint = {
    font: theme.font(),
    fontSize: theme.length('fontSize'),
    fill: theme.color('mainBkg'),
    stroke: theme.outline('nodeBorder'),
    plainStroke:
      theme.gradient() && prepared.nodes.some((v) => usesPlain(v.shape))
        ? theme.color('nodeBorder')
        : undefined,
    text: theme.color('nodeTextColor'),
    strokeWidth: theme.length('strokeWidth'),
    line: theme.color('lineColor'),
    arrow: theme.color('arrowheadColor'),
    shadow: theme.value('dropShadow') === 'none' ? undefined : theme.filter('dropShadow'),
  };
  const frame =
    prepared.groups.length > 0
      ? { stroke: theme.outline('nodeBorder'), text: theme.color('titleColor') }
      : undefined;
  const card = prepared.nodes.some((v) => v.shape === 'collapsedGroup')
    ? { separator: theme.color('flowContainerStroke'), dots: theme.color('nodeBorder') }
    : undefined;
  const border = theme.palette('borderColorArray');
  const palette = border.length > 0 ? { border, bkg: theme.palette('bkgColorArray') } : undefined;
  const edgeLabel = prepared.edges.some((e) => e.label.width > 0)
    ? { fill: theme.color('edgeLabelBackground'), text: theme.color('textColor') }
    : undefined;
  const title = titled ? theme.color('textColor') : undefined;
  return { heads, node, frame, card, palette, edgeLabel, title };
}
