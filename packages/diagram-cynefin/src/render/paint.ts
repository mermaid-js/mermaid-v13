// The colours the cynefin renderer draws with (spec #423 "Renderer (T4)", D152, D215, D227):
// v12's `themeVariables.cynefin.*` colours as the plugin's own flat variables (`plugin.ts`),
// and the constants every theme shares. v12 put fills in attributes and strokes and fonts in a
// `<style>` (`styles.ts:29-93`); v13 writes all of them as attributes. Each name is a literal,
// so the `usedBy` scan sees it. Cynefin has no theme-name or `look` branch, no gradient and no
// shadow (D227).
import type { RenderContext } from '@mermaid-js/core';
import type { Paint, SafeValue } from '@mermaid-js/core/svg';
import type { CynefinDomainName } from '../model.ts';

type Theme = RenderContext['theme'];

/**
 * The constant paints of v12's `cynefinRenderer.ts` and `styles.ts` (`mermaid@12.2.0` lines),
 * the same in every theme.
 */
export const CYNEFIN_PAINT = {
  /** Quadrant backgrounds (:130). */
  quadrantOpacity: 0.4,
  /** The confusion ellipse (:165). */
  ellipseOpacity: 0.5,
  /** Item badges (:301, S:46) and the `+N more` badge (:345, S:55). */
  itemOpacity: 0.95,
  overflowOpacity: 0.6,
  /** The fold and the horizon (S:63), the ellipse (S:72), the overflow badge (S:58). */
  boundaryDash: '6 3' as SafeValue,
  ellipseDash: '4 2' as SafeValue,
  overflowDash: '3 2' as SafeValue,
} as const;

export interface Paints {
  /** A domain's background: quadrant, ellipse and its item badges (:61-66). */
  readonly background: (domain: CynefinDomainName) => Paint;
  readonly boundary: Paint;
  readonly cliff: Paint;
  readonly arrow: Paint;
  /** Subtitles, item text and transition labels. */
  readonly text: Paint;
  /** Domain labels and the title. */
  readonly label: Paint;
}

/** Every paint the diagram uses, read before the root is written so that it declares them. */
export function paints(theme: Theme): Paints {
  const backgrounds: Readonly<Record<CynefinDomainName, Paint>> = {
    complex: theme.color('cynefinComplexBg'),
    complicated: theme.color('cynefinComplicatedBg'),
    chaotic: theme.color('cynefinChaoticBg'),
    clear: theme.color('cynefinClearBg'),
    confusion: theme.color('cynefinConfusionBg'),
  };
  return {
    background: (d) => backgrounds[d],
    boundary: theme.color('cynefinBoundaryColor'),
    cliff: theme.color('cynefinCliffColor'),
    arrow: theme.color('cynefinArrowColor'),
    text: theme.color('cynefinTextColor'),
    label: theme.color('cynefinLabelColor'),
  };
}
