/**
 * An embedded diagram's frame (ADR-15), the same in every host: a border, a transparent
 * background, an optional title strip with a line under it, and the inner diagram's own `<svg>`
 * at its natural size. Hosts measure the title, lay the box out as a node and draw the title.
 * `embeddedSvg` checks the inner diagram's root. `mermaid`'s block pass loads this module and
 * hands the shapes to hosts as `RenderContext.blockShapes` (D554).
 */
import type { EmbeddedDiagram } from '../pipeline/types.ts';
import { inertProblem, type InertOptions } from './inert.ts';
import { translate } from './path.ts';
import type { Attrs, EmbeddedSvg } from './types.ts';
import type { SvgWriter } from './writer.ts';

/** Space between the border (or the title strip) and the inner diagram. */
const PAD = 8;
/** Space above and below the title in its strip. */
const TITLE_PAD = 6;
/** The stand-in's inner size when no block was drawn (the plugin called without `mermaid`). */
const STAND_IN = { width: 120, height: 60 };

interface Measured {
  readonly width: number;
  readonly height: number;
}

/** The height of the title strip for a title `th` high; none for an untitled block. */
export const titleStrip = (th: number): number => (th > 0 ? th + 2 * TITLE_PAD : 0);

/** The box of a block holding `inner` (`null`: a stand-in), with its `title`, in px. */
export function framedSize(inner: EmbeddedDiagram | null, title: Measured): Measured {
  const { width, height } = inner ?? STAND_IN;
  return {
    width: Math.max(width, title.width) + 2 * PAD,
    height: titleStrip(title.height) + height + 2 * PAD,
  };
}

/**
 * Draws the block `size` centred on (0, 0): `frame` paints the border and the line under a
 * title `th` high, and `inner`'s root goes below. Returns the y of the title's centre.
 */
export function drawFramed(
  w: SvgWriter,
  size: Measured,
  th: number,
  inner: EmbeddedDiagram | null,
  frame: Attrs
): number {
  const { width, height } = size;
  const top = -height / 2;
  w.outline('node', 'rect', { x: -width / 2, y: top, width, height, ...frame });
  const s = titleStrip(th);
  if (s > 0) {
    w.outline('divider', 'line', {
      x1: -width / 2,
      y1: top + s,
      x2: width / 2,
      y2: top + s,
      stroke: frame.stroke,
      'stroke-width': frame['stroke-width'],
    });
  }
  if (inner) {
    w.open('g', { class: 'embedded', transform: translate(-inner.width / 2, top + s + PAD) });
    w.embed(inner.svg);
    w.close();
  }
  return top + s / 2;
}

/**
 * `svg`, a finished diagram's root `<svg>`, as markup a host may splice in with
 * `SvgWriter.embed()` (ADR-15). Throws unless it is one root element and inert under `options`
 * (its `theme: 'auto'` sheet allowed).
 */
export function embeddedSvg(svg: string, options: InertOptions = {}): EmbeddedSvg {
  if (!svg.startsWith('<svg') || !svg.endsWith('</svg>'))
    throw new Error('An embedded diagram must be one root <svg>');
  const problem = inertProblem(svg, { ...options, themeStyle: true });
  if (problem !== undefined) throw new Error(`Embedded SVG is not inert: ${problem}`);
  return svg as EmbeddedSvg;
}
