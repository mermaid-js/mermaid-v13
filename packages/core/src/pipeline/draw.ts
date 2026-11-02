/**
 * The synchronous back half of a render (DESIGN §3 `renderSync` steps 4–6): layout, render,
 * serialise, with the bench's stage brackets (R-PERF-5).
 */
import { streamWriter } from '../svg/writer.ts';
import { stageEnd, stageStart } from '../timing/index.ts';
import type { DiagramPlugin, RenderContext } from './types.ts';

export interface Drawn {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
}

// The root's viewBox is `0 0 W H` (DESIGN §7.2).
const VIEW_BOX = /^<svg\b[^>]*?\sviewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/;

export function drawDiagram<M, L>(
  plugin: DiagramPlugin<M, L>,
  model: M,
  ctx: RenderContext
): Drawn {
  let t = stageStart();
  const layout = plugin.layout ? plugin.layout(model, ctx) : (undefined as L);
  stageEnd('layout', t);
  t = stageStart();
  const w = streamWriter();
  plugin.render(model, layout, ctx, w);
  const svg = w.finish();
  stageEnd('serialise', t);
  const box = VIEW_BOX.exec(svg);
  return { svg, width: box ? Number(box[3]) : 0, height: box ? Number(box[4]) : 0 };
}
