/**
 * The info layout (#420, `layoutKind: 'custom'`): v12's `infoRenderer.ts` with the drawing
 * taken out. v12 sized the SVG 400 × 100 (`configureSvgSize(svg, 100, 400, true)`) and drew
 * one 32 px text, anchored in the middle, at (100, 40). The text is measured through the
 * injected measurer, and the bounds grow wherever it runs past v12's canvas, which v12 clipped
 * (a version string longer than v12's `v12.2.0` runs past its left edge). Every length is in
 * {@link INFO_METRICS}.
 */
import type { RenderContext } from '@mermaid-js/core';
import type { FontKey } from '@mermaid-js/core/text';
import type { Rect } from '@mermaid-js/shared/layout';

/** v12's canvas and text position (`infoRenderer.ts`), in px. */
export const INFO_METRICS = {
  width: 400,
  height: 100,
  x: 100,
  y: 40,
  fontSize: 32,
  /** v12 sets no weight: normal. */
  weight: 400,
} as const;

export type { Rect };

export interface InfoLayout {
  /** `v<version>`: the version of the `mermaid` package that renders it (#420 Q1). */
  readonly text: string;
  /** The text's anchor point: its middle, on the baseline. */
  readonly x: number;
  readonly y: number;
  readonly fontSize: number;
  /** v12's 400 × 100 canvas, grown to hold the measured text. */
  readonly bounds: Rect;
}

/** What the layout reads from the render context. */
export type InfoLayoutContext = Pick<RenderContext, 'measurer' | 'theme' | 'version'>;

/** Lays out the version line in px. */
export function layoutInfo(ctx: InfoLayoutContext): InfoLayout {
  const m = INFO_METRICS;
  const text = `v${ctx.version}`;
  const font: FontKey = {
    family: ctx.theme.value('fontFamily'),
    size: m.fontSize,
    weight: m.weight,
  };
  const half = ctx.measurer.width(text, font, 0) / 2;
  const { ascent, descent } = ctx.measurer.metrics(font);
  const left = Math.min(0, m.x - half);
  const top = Math.min(0, m.y - ascent);
  const right = Math.max(m.width, m.x + half);
  const bottom = Math.max(m.height, m.y + descent);
  return {
    text,
    x: m.x,
    y: m.y,
    fontSize: m.fontSize,
    bounds: { x: left, y: top, width: right - left, height: bottom - top },
  };
}
