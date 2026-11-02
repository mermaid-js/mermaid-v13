/**
 * The synchronous back half of a render (DESIGN §3 `renderSync` steps 4–6): layout, render,
 * serialise, with the bench's stage brackets (R-PERF-5). With extension hooks it also runs
 * `postParse`, `postLayout` and `postRender`, then re-checks the allow-list (R-SEC-2).
 */
import type { AstNode } from '../parser-kit/ast.ts';
import { inertProblem } from '../svg/inert.ts';
import { streamWriter, treeWriter } from '../svg/writer.ts';
import { stageEnd, stageStart } from '../timing/index.ts';
import { MermaidError } from './errors.ts';
import type { HookRun, LaidOut } from './extensions.ts';
import type { DiagramPlugin, RenderContext } from './types.ts';

export interface Drawn {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
}

/** What {@link drawDiagram} needs to run extension hooks. */
export interface DrawHooks {
  readonly run: HookRun;
  /** The parse result's AST, handed to `postParse`. */
  readonly ast: AstNode;
}

// The root's viewBox is `0 0 W H` (DESIGN §7.2).
const VIEW_BOX = /^<svg\b[^>]*?\sviewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/;

export function drawDiagram<M, L>(
  plugin: DiagramPlugin<M, L>,
  model: M,
  ctx: RenderContext,
  hooks?: DrawHooks
): Drawn {
  const run = hooks?.run;
  // The AST is data for hooks only; the renderer draws the model (DESIGN §12.2).
  if (run && hooks) run.postParse(hooks.ast);
  let t = stageStart();
  let layout = plugin.layout ? plugin.layout(model, ctx) : (undefined as L);
  if (run) {
    const laidOut = { kind: plugin.layoutKind, diagram: plugin.id, layout } as LaidOut;
    layout = run.postLayout(laidOut).layout as L;
  }
  stageEnd('layout', t);
  t = stageStart();
  let svg: string;
  if (run?.editsTree) {
    const w = treeWriter();
    plugin.render(model, layout, ctx, w);
    run.postRender(w.tree);
    svg = w.finish();
    const problem = inertProblem(svg, {
      securityLevel: ctx.securityLevel,
      linkSchemes: ctx.linkSchemes,
      themeStyle: ctx.theme.autoDeclarations() !== undefined,
    });
    if (problem !== undefined)
      throw new MermaidError(
        'INTERNAL',
        `An extension's postRender output fails the allow-list: ${problem}`
      );
  } else {
    const w = streamWriter();
    plugin.render(model, layout, ctx, w);
    svg = w.finish();
  }
  stageEnd('serialise', t);
  const box = VIEW_BOX.exec(svg);
  return { svg, width: box ? Number(box[3]) : 0, height: box ? Number(box[4]) : 0 };
}
