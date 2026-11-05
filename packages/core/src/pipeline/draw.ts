/**
 * The synchronous back half of a render (DESIGN §3 `renderSync` steps 4–6): layout, render,
 * serialise, with the bench's stage brackets (R-PERF-5). With extension hooks it also runs
 * `postParse`, `postLayout` and `postRender`, hands the writer the active outline drawer (D302),
 * then re-checks the allow-list (R-SEC-2).
 */
import { asLimitError, checkOutput } from '../limits/index.ts';
import type { AstNode } from '../parser-kit/ast.ts';
import { inertProblem } from '../svg/inert.ts';
import { streamWriter, treeWriter } from '../svg/writer.ts';
import { stageEnd, stageStart } from '../timing/index.ts';
import { MermaidError } from './errors.ts';
import type { HookRun, LaidOut } from './extensions.ts';
import type { DiagramPlugin, RenderContext, TextRenderContext } from './types.ts';

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

/** Layout, then the `postLayout` hooks with the profile's units (D86). */
function laidOut<M, L>(
  plugin: DiagramPlugin<M, L>,
  model: M,
  ctx: RenderContext,
  run?: HookRun
): L {
  const layout = plugin.layout ? plugin.layout(model, ctx) : (undefined as L);
  if (!run) return layout;
  const units = ctx.units.id;
  return run.postLayout({ kind: plugin.layoutKind, diagram: plugin.id, units, layout } as LaidOut)
    .layout as L;
}

export function drawDiagram<M, L>(
  plugin: DiagramPlugin<M, L>,
  model: M,
  ctx: RenderContext,
  hooks?: DrawHooks
): Drawn {
  let svg: string;
  try {
    const run = hooks?.run;
    // The AST is data for hooks only; the renderer draws the model (DESIGN §12.2).
    if (run && hooks) run.postParse(hooks.ast);
    let t = stageStart();
    const layout = laidOut(plugin, model, ctx, run);
    stageEnd('layout', t);
    t = stageStart();
    // The gradient is the theme's, its id the render's (D182); off, the id prefix is not read.
    const gradient = ctx.theme.gradient();
    // The first registered outline drawer, if it is active for this render (D302).
    const outline = run?.outline();
    const options = outline ? { gradient, outline: outline.draw } : { gradient };
    if (run?.editsTree) {
      const w = treeWriter(options);
      plugin.render(model, layout, ctx, w);
      run.postRender(w.tree);
      svg = w.finish();
    } else {
      const w = streamWriter(options);
      plugin.render(model, layout, ctx, w);
      svg = w.finish();
    }
    // What extensions wrote is checked again, values as well as names (R-SEC-2).
    if (run?.editsTree || outline) {
      const problem = inertProblem(svg, {
        securityLevel: ctx.securityLevel,
        linkSchemes: ctx.linkSchemes,
        themeStyle: ctx.theme.autoDeclarations() !== undefined,
        gradient: gradient?.id ?? false,
      });
      if (problem !== undefined)
        throw new MermaidError(
          'INTERNAL',
          `${outline && !run?.editsTree ? `Extension "${outline.id}"'s outline` : "An extension's postRender"} output fails the allow-list: ${problem}`
        );
    }
    stageEnd('serialise', t);
  } catch (error) {
    // A stack overflow in a recursive stage is nesting too deep for it: a limit, not a crash.
    throw asLimitError(error) ?? error;
  }
  checkOutput(svg, ctx.limits);
  const box = VIEW_BOX.exec(svg);
  return { svg, width: box ? Number(box[3]) : 0, height: box ? Number(box[4]) : 0 };
}

/** A diagram's `ascii` hook: `(model, layout, ctx) → text` (D76). */
export type AsciiHook<M = unknown, L = unknown> = (
  model: M,
  layout: L,
  ctx: TextRenderContext
) => string;

/**
 * The text counterpart of {@link drawDiagram} (DESIGN §6.3): layout with `ctx` (the cell
 * profile and measurer), then the `ascii` hook. With hooks, `postParse` and `postLayout` run as
 * for SVG and `postRender` never does (D86). `ctx.limits.maxOutputLength` caps the text.
 */
export function drawText<M, L>(
  plugin: DiagramPlugin<M, L>,
  ascii: AsciiHook<M, L>,
  model: M,
  ctx: TextRenderContext,
  hooks?: DrawHooks
): string {
  let text: string;
  try {
    if (hooks?.run) hooks.run.postParse(hooks.ast);
    const run = hooks?.run;
    let t = stageStart();
    const layout = laidOut(plugin, model, ctx, run);
    stageEnd('layout', t);
    t = stageStart();
    text = ascii(model, layout, ctx);
    stageEnd('serialise', t);
  } catch (error) {
    throw asLimitError(error) ?? error;
  }
  checkOutput(text, ctx.limits);
  return text;
}
