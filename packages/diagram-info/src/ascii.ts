/**
 * The info diagram's text output (#420 Q2, D320), a separate lazily loaded entry
 * (`@mermaid-js/diagram-info/ascii`, manifest key `ascii`) so SVG renders never load it: the
 * one line `v<version>`, through core's text-grid kit. Both charsets draw the same line, and
 * nothing is dropped, so it never warns. Like the SVG it draws no title (D218).
 */
import type { TextRenderContext } from '@mermaid-js/core';
import { Canvas, drawText } from '@mermaid-js/core/ascii';
import type { InfoLayout } from './layout.ts';
import type { InfoModel } from './model.ts';

/** The info diagram's `ascii` hook (DESIGN §12.1): `v<version>`, no trailing spaces. */
export function ascii(_model: InfoModel, layout: InfoLayout, _ctx: TextRenderContext): string {
  const canvas = new Canvas();
  drawText(canvas, 0, 0, layout.text);
  return canvas.toString();
}
