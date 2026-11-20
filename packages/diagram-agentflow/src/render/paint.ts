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
import { arrowheads, type Arrowheads } from '@mermaid-js/shared/svg/arrowheads';
import { nodePaint, type NodePaint } from '@mermaid-js/shared/svg/node-paint';
import { usesPlain } from './shapes.ts';
import type { Palette } from './slots.ts';

type ThemeOf = AgentflowRenderContext['theme'];
type Color = ReturnType<ThemeOf['color']>;

/** A flow's frame (`nodeBorder` stroke, as v12's neo rule drew it) and its title. */
export interface FramePaint {
  readonly stroke: OutlinePaint;
  readonly text: Color;
}

/** A label's background and ink. */
export interface LabelPaint {
  readonly fill: Color;
  readonly text: Color;
}

export interface Paints {
  readonly heads: Arrowheads;
  readonly node: NodePaint;
  /** Set when there is a frame to draw. */
  readonly frame?: FramePaint;
  /** A collapsed card's separator (`flowContainerStroke`) and dots (`nodeBorder`). */
  readonly card?: { readonly separator: Color; readonly dots: Color };
  /** Per-item colour, when the theme carries a non-empty `borderColorArray` (D152). */
  readonly palette?: Palette;
  /** Set when an edge has a label. */
  readonly edgeLabel?: LabelPaint;
  /** The front-matter title (D218): `textColor`. */
  readonly title?: Color;
}

/** The paints of one render, in the order their aliases are declared. */
export function paints(theme: ThemeOf, prepared: AgentflowPrepared, titled: boolean): Paints {
  const heads = arrowheads(theme);
  const node = nodePaint(theme, () => prepared.nodes.some((v) => usesPlain(v.shape)));
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
