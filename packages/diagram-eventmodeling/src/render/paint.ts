// The colours the event modeling renderer draws with (spec #527 "Renderer (T4)", D215, D227,
// D527): v12's flat `em*` variables and `emTextColor`, from the package's own table
// (`theme/table.ts`). v12 put every fill and stroke in attributes (`db.ts:290-327`,
// `renderer.ts`) and had no `<style>` (`styles.js` is empty); so does v13. Each name is a
// literal, so the `usedBy` scan sees it. No theme-name, `look` or hand-drawn branch (D227).
import type { RenderContext } from '@mermaid-js/core';
import type { Paint } from '@mermaid-js/core/svg';
import type { EventModelKind } from '../model.ts';

type Theme = RenderContext['theme'];

/** A box's fill and stroke. */
export interface KindPaint {
  readonly fill: Paint;
  readonly stroke: Paint;
}

export interface Paints {
  /** By frame kind (`calculateEntityVisualProps`). */
  readonly kind: Readonly<Record<EventModelKind, KindPaint>>;
  readonly laneFill: Paint;
  readonly laneStroke: Paint;
  readonly relation: Paint;
  readonly arrowhead: Paint;
  /** Box and lane text (v12 left it to the page's colour). */
  readonly text: Paint;
}

/** Every paint the diagram uses, read before the root is written so that it declares them. */
export function paints(theme: Theme): Paints {
  return {
    kind: {
      ui: { fill: theme.color('emUiFill'), stroke: theme.color('emUiStroke') },
      pcr: { fill: theme.color('emProcessorFill'), stroke: theme.color('emProcessorStroke') },
      rmo: { fill: theme.color('emReadModelFill'), stroke: theme.color('emReadModelStroke') },
      cmd: { fill: theme.color('emCommandFill'), stroke: theme.color('emCommandStroke') },
      evt: { fill: theme.color('emEventFill'), stroke: theme.color('emEventStroke') },
    },
    laneFill: theme.color('emSwimlaneBackgroundOdd'),
    laneStroke: theme.color('emSwimlaneBackgroundStroke'),
    relation: theme.color('emRelationStroke'),
    arrowhead: theme.color('emArrowhead'),
    text: theme.color('emTextColor'),
  };
}
