/**
 * The c4-beta layout (spec #730 §Layout): a `C4BetaModel` measured (`./prepare.ts`), laid out by
 * core's `layered` engine, and converted into the `C4Layout` scene legacy C4's painters draw
 * (`./scene.ts`). c4-beta stays in the one `c4` plugin and calls the engine directly, as the
 * usecase package's fallback does: a custom plugin's `ctx.layout` throws. A `layout` naming
 * another engine is ignored, with one warning.
 */
import { layered, type LayoutModel } from '@mermaid-js/core/layout';
import { C4BETA_LAYOUT_IGNORED } from '../codes.ts';
import type { C4Layout } from '../layout/types.ts';
import { prepareC4Beta, type C4BetaLayoutContext, type C4BetaPrepared } from './prepare.ts';
import { laidInPx } from './cells.ts';
import { placeC4Beta } from './scene.ts';

/** Everything a c4-beta layout produces: the engine's input and answer, and the scene. */
export interface C4BetaLaidOut {
  readonly prepared: C4BetaPrepared;
  readonly laid: LayoutModel;
  readonly scene: C4Layout;
}

/** Lays `model` out. Pure: the model is not changed, and equal input gives equal output. */
export function layoutC4BetaFull(
  model: C4BetaPrepared['model'],
  ctx: C4BetaLayoutContext
): C4BetaLaidOut {
  warnLayoutIgnored(ctx);
  const prepared = prepareC4Beta(model, ctx);
  const laid = layered(prepared.graph);
  // Text output: the engine answered in cells, and the scene is made in px (`./cells.ts`).
  const placedIn = prepared.cell ? laidInPx(laid, prepared.cell) : laid;
  return { prepared, laid, scene: placeC4Beta(prepared, placedIn) };
}

/** The engines c4-beta answers to silently: the one it uses, and v12's name for it. */
const OWN_ENGINES: ReadonlySet<unknown> = new Set([undefined, 'layered', 'dagre']);

/** One {@link C4BETA_LAYOUT_IGNORED} when `layout` names another engine. */
function warnLayoutIgnored({ config, warn }: C4BetaLayoutContext): void {
  const name = config.layout;
  if (OWN_ENGINES.has(name)) return;
  warn?.({
    code: C4BETA_LAYOUT_IGNORED,
    message: `c4-beta is laid out with "layered"; layout "${String(name)}" is ignored.`,
    path: 'layout',
  });
}

/** The scene of `model`. */
export const layoutC4Beta = (...args: Parameters<typeof layoutC4BetaFull>): C4Layout =>
  layoutC4BetaFull(...args).scene;

export type { C4BetaLayoutContext } from './prepare.ts';
