/**
 * `@mermaid-js/plugin-hand-drawn`: the hand-drawn look (D300). Register the extension and set
 * `handDrawn: true` (or v12's `look: handDrawn`):
 *
 * ```ts
 * import { handDrawn } from '@mermaid-js/plugin-hand-drawn';
 * await mermaid.registerExternalDiagrams([handDrawn]);
 * ```
 *
 * Its outline drawer (D302) sketches every outline a diagram draws with `w.outline` (flowchart,
 * class, state and ER; mindmap from its port), with roughjs's DOM-free generator and a fixed seed
 * (`handDrawnSeed`, D304). Its config fragment owns `handDrawn` and `handDrawnSeed` and aliases
 * `look: handDrawn` (D303). The layout never sees the sketch. Text output is never sketched: it
 * gets one `ASCII_DROPPED` warning (`feature: 'handDrawn'`, D305). No `postRender` hook, so the
 * streaming writer stays in use.
 */
import type { ExtensionPlugin } from '@mermaid-js/core';
import { declareNodeBorder, withNodeBorder } from './border.ts';
import { activate, draw } from './drawer.ts';
import { configFragment } from './generated/config-fragment.ts';

/** The hand-drawn extension: register it with `registerExternalDiagrams([handDrawn])`. */
export const handDrawn: ExtensionPlugin = {
  id: 'hand-drawn',
  config: configFragment,
  outline: {
    active: (ctx) => activate(ctx.config as Readonly<Record<string, unknown>>),
    draw: (role, tag, attrs, sink, ctx) =>
      draw(
        role,
        tag,
        withNodeBorder(role, attrs, ctx),
        sink,
        ctx.config as Readonly<Record<string, unknown>>
      ),
  },
  postLayout(laidOut, ctx) {
    if ((ctx.config as { handDrawn?: unknown }).handDrawn !== true) return laidOut;
    if (laidOut.units === 'cell')
      ctx.warn({
        code: 'ASCII_DROPPED',
        feature: 'handDrawn',
        message: 'Text output is not hand-drawn; handDrawn is not used.',
      });
    else declareNodeBorder(ctx);
    return laidOut;
  },
};

export default handDrawn;

export { EDGE, GROUP, LABEL, MARK, NODE, COMPOSITE, optionsFor } from './roles.ts';
export {
  roughSeed,
  sketch,
  strokeLineDash,
  type SketchOptions,
  type SketchPath,
  type SketchTag,
} from './sketch.ts';
