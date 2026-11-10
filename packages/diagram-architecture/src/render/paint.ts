/**
 * The theme variables the architecture renderer reads (D152, D227): v12's `architectureStyles.ts`
 * as attributes, with no theme name and no `look` (v12 had none for architecture). The five
 * `arch*` variables are the package's own table (`theme/table.ts`); the text takes `textColor`,
 * which v12's root style gave every label. All are read before the root is written, so its
 * style declares their aliases.
 */
import type { RenderContext } from '@mermaid-js/core';
import type { Length, Paint, SafeValue } from '@mermaid-js/core/svg';

type Theme = RenderContext['theme'];

export interface Paints {
  /** `.edge`: `archEdgeColor` at `archEdgeWidth`, no fill. */
  readonly edge: Paint;
  readonly edgeWidth: Length;
  /** `.arrow`: `archEdgeArrowColor`. */
  readonly arrow: Paint;
  /** `.node-bkg` (group borders, and a service with no icon): dashed, no fill. */
  readonly border: Paint;
  readonly borderWidth: Length;
  readonly dash: SafeValue;
  /** Every label. */
  readonly text: Paint;
}

export function paints(theme: Theme, dash: number): Paints {
  return {
    edge: theme.color('archEdgeColor'),
    edgeWidth: theme.length('archEdgeWidth'),
    arrow: theme.color('archEdgeArrowColor'),
    border: theme.color('archGroupBorderColor'),
    borderWidth: theme.length('archGroupBorderWidth'),
    // A plain number: v12's `stroke-dasharray: 8`.
    dash: String(dash) as SafeValue,
    text: theme.color('textColor'),
  };
}
