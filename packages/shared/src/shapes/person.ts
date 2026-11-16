/**
 * The person shape's figure: a head over a body in c4model.com's proportions (#683, as v12's fix
 * mermaid-js/mermaid#8322). The head's radius is HEAD × the body's width, held between HEAD_MIN
 * and HEAD_MAX (a body widened by a long label keeps a person-sized head), and overlaps the body
 * by OVERLAP × itself; the body is at least BODY × its width tall. The label is centred on the
 * part of the body the head does not cover, one head radius below the shape's centre.
 */
const HEAD = 0.23;
const HEAD_MIN = 16;
const HEAD_MAX = 80;
const OVERLAP = 0.27;
const BODY = 0.6;

/** The head's radius for a body `W` wide. */
const headRadius = (W: number): number => Math.min(HEAD_MAX, Math.max(HEAD_MIN, W * HEAD));

/** The figure's height around a padded label `W` wide and `h` high, and the label's shift. */
export function personSize(W: number, h: number): { h: number; dy: number } {
  const r = headRadius(W);
  const overlap = r * OVERLAP;
  const body = Math.max(overlap + h, W * BODY);
  return { h: body + 2 * r - overlap, dy: r };
}

/** The head's radius and the body's top (from the centre) of a figure `W` × `H`. */
export function personFigure(W: number, H: number): { r: number; bodyTop: number } {
  const r = headRadius(W);
  return { r, bodyTop: -H / 2 + 2 * r - r * OVERLAP };
}
