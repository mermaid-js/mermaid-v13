/**
 * The synchronous side of one API object (DESIGN §3 steps 5–6): `renderSync`'s draw, as SVG
 * (`drawSvg`) or as text (`drawAscii`), over what `prepare.ts` loaded.
 */
import {
  drawDiagram,
  drawText,
  NotLoadedError,
  renderErrorSvg,
  type EmbeddedText,
  type TextRenderContext,
  type Warning,
} from '@mermaid-js/core';
import { cellProfile, pxProfile } from '@mermaid-js/core/layout';
import type {
  RenderOptions,
  RenderResult,
  TextRenderOptions,
  TextRenderResult,
} from './api-types.ts';
import type { Parsed } from './analysis-cache.ts';
import type { Bind, DrawBlocks } from './block-pass.ts';
import type { Snapshot } from './config-snapshot.ts';
import { contextFor } from './draw-context.ts';
import { warnHtmlDropped, type DrawContext } from './errors.ts';
import { checkFormat } from './prepare.ts';
import { hooksFor, type Session } from './session.ts';
import { VERSION } from './version.ts';

/** The cached or fresh analysis of `text`, or a placeholder svg for an unloaded plugin. */
function analysisFor(
  k: Session,
  text: string,
  s: Snapshot,
  options: RenderOptions | undefined,
  ascii: boolean
): Parsed | RenderResult {
  const { analyser } = k;
  const hit = analyser.cache.get(text, s);
  if (hit) return { analysis: hit };
  const f = analyser.detectSupported(text, s, ascii);
  const plugin = k.registry.plugin(f.detected.id);
  if (plugin) return analyser.analysisOf(text, s, f, plugin, ascii);
  const missing = new NotLoadedError([{ kind: 'diagram', name: f.detected.id }]);
  if (ascii || !options?.placeholders) throw missing;
  return {
    svg: renderErrorSvg(missing, { version: VERSION }),
    diagramType: f.detected.type,
    width: 0,
    height: 0,
    warnings: [...k.skipped, { code: 'PLACEHOLDER', message: missing.message }],
  };
}

/**
 * Text output (DESIGN §6.3): cell layout, the ascii hook, columns and rows (D80, D84).
 * `blocksFor` draws the blocks (ADR-15) with the options it is given: this draw's charset and
 * padding, never its width (only the outermost drawing is fitted to `maxWidth`).
 */
export function drawAscii(
  k: Session,
  text: string,
  s: Snapshot,
  options: RenderOptions | undefined,
  { analysis, full }: Parsed,
  blocksFor?: (options: TextRenderOptions) => DrawBlocks<EmbeddedText> | undefined
): TextRenderResult {
  const { prepared, plugin } = analysis;
  // Text output reads the AST and the model's AST ids (D82's drop warnings).
  const parse = full ?? analysis.full();
  k.analyser.checkText(analysis.detected);
  const hook = k.registry.ascii(plugin.id);
  const backend = k.textBackend;
  if (!hook || !backend)
    throw new NotLoadedError([{ kind: 'diagram', name: `${plugin.id}/ascii` }]);
  const explicit = (options as TextRenderOptions | undefined)?.ascii;
  const { charset, padding, maxWidth } = backend.asciiOptions(prepared.config, explicit);
  const { title } = analysis;
  // The diagram's text entry reads the section from the config: hand it the resolved one.
  const ascii = Object.freeze({
    charset,
    padding,
    ...(maxWidth === undefined ? {} : { maxWidth }),
  });
  // The blocks (ADR-15), drawn in this charset and padding at the first lookup.
  const inner = blocksFor?.({ format: 'ascii', now: options?.now, ascii: { charset, padding } });
  const { embed: embedText } = k.blocks.lookup(
    inner,
    () => ctx.idPrefix,
    (w) => ctx.warn(w)
  );
  const { ctx, warnings } = contextFor(k, text, s, options, analysis, {
    units: cellProfile(padding),
    measurer: backend.cellMeasurer,
    width: maxWidth,
    text: {
      config: Object.freeze({ ...prepared.config, ascii }),
      ...(title !== undefined ? { title } : {}),
      ast: parse.ast,
      ...(embedText ? { embedText } : {}),
    },
  });
  const textCtx = ctx as TextRenderContext;
  // D86: postParse and postLayout run (LaidOut.units 'cell'); postRender, afterMount never.
  const textHooks = hooksFor(k, analysis, true);
  const run = textHooks.size === 0 ? undefined : textHooks.start(textCtx, plugin.id);
  const out = drawText(plugin, hook, parse.model, textCtx, run && { run, ast: parse.ast });
  warnHtmlDropped(ctx);
  const lines = out === '' ? [] : out.split('\n');
  const columns = lines.reduce((m, l) => Math.max(m, backend.cellWidth(l)), 0);
  // D84: never cropped; say so when it still does not fit.
  if (maxWidth !== undefined && columns > maxWidth)
    ctx.warn({
      code: 'ASCII_TOO_WIDE',
      message: `The drawing is ${columns} columns wide; ascii.maxWidth is ${maxWidth}.`,
    });
  return {
    format: 'ascii',
    text: out,
    columns,
    rows: lines.length,
    diagramType: prepared.diagramType,
    warnings,
  };
}

/** An SVG draw: the drawn svg, its context, warnings and the binder maker (#669). */
export interface SvgDraw {
  readonly drawn: ReturnType<typeof drawDiagram>;
  readonly ctx: DrawContext;
  readonly warnings: Warning[];
  readonly mount: (result: RenderResult, host?: boolean) => Bind | undefined;
}

/** One SVG draw of `a`, with its blocks (ADR-15) drawn at the first lookup. */
export function drawSvg(
  k: Session,
  text: string,
  s: Snapshot,
  options: RenderOptions | undefined,
  { analysis: a, full }: Parsed,
  blockDraw: DrawBlocks | undefined
): SvgDraw {
  const units = { units: pxProfile, width: options?.availableWidth, blocks: blockDraw };
  const { ctx, warnings, mounter } = contextFor(k, text, s, options, a, units);
  const renderHooks = hooksFor(k, a);
  const run = renderHooks.size === 0 ? undefined : renderHooks.start(ctx, a.plugin.id);
  // A `postParse` hook reads the AST: this draw has the full parse (DESIGN §4.2).
  const parse = renderHooks.readsAst ? (full ?? a.full()) : a.prepared.parse;
  // D537: the line-hop step, which decides whether this render hops.
  const edges = k.registry.hops(a);
  const drawHooks = run && { run, ast: parse.lean ? undefined : parse.ast };
  const drawn = drawDiagram(a.plugin, parse.model, ctx, drawHooks, edges);
  if (ctx.inline.dropped.size > 0) warnHtmlDropped(ctx);
  // Binds the run's interactions, then each block's in its own nested root (#669).
  return { drawn, ctx, warnings, mount: mounter<RenderResult>(run) };
}

function drawWith(
  k: Session,
  text: string,
  s: Snapshot,
  options: RenderOptions | undefined,
  prepared?: Parsed
): RenderResult | TextRenderResult {
  const format = checkFormat(k, text, s, options?.format);
  const parsed = prepared ?? analysisFor(k, text, s, options, format === 'ascii');
  if (!('analysis' in parsed)) return parsed;
  const { analysis } = parsed;
  if (format === 'ascii')
    return drawAscii(k, text, s, options, parsed, (o) =>
      k.blocks.of(analysis)?.drawText({ root: text, at: 0, a: analysis, s }, o)
    );
  const blockDraw = k.blocks.of(analysis)?.draw({ root: text, at: 0, a: analysis, s }, options);
  const { drawn, warnings, mount } = drawSvg(k, text, s, options, parsed, blockDraw);
  const result: RenderResult = { ...drawn, diagramType: analysis.prepared.diagramType, warnings };
  // The DOM adapter's afterMount entry point (DESIGN §12.2, §12.3); `run`/`mount` call it.
  const bind = mount(result, true);
  if (bind) result.bindFunctions = bind;
  return result;
}

/** `drawWith`; the queued discovery warnings leave the queue only once a draw has them. */
export function draw(
  k: Session,
  text: string,
  s: Snapshot,
  options: RenderOptions | undefined,
  prepared?: Parsed
): RenderResult | TextRenderResult {
  const queued = k.skipped.length;
  const result = drawWith(k, text, s, options, prepared);
  if (queued > 0) k.skipped.splice(0, queued);
  return result;
}
