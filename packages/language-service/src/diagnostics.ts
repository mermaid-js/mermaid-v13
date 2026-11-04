/**
 * Diagnostics (D91): the preprocess and parser diagnostics as they are, each once. A v12 type with no
 * facet gets one info diagnostic on its header word, as does one whose facet was not
 * preloaded (D155); a failed load gets a warning, a facet whose parse throws an error
 * (`LANGUAGE_FACET_FAILED`); a type v12 does not know gets the renderer's
 * `UNSUPPORTED_DIAGRAM` error.
 */
import type { Diagnostic, Range } from '@mermaid-js/core/parser-kit';
import type { DocumentContext } from './context.ts';

/** The diagram's first word (`sequenceDiagram`), or its line when that has no word. */
function headerRange(text: string, start: number): Range {
  const line = /^[^\r\n]*/.exec(text.slice(start))?.[0] ?? '';
  const word = /^[^\s;{]*/.exec(line)?.[0] ?? '';
  return { start, end: start + (word.length > 0 ? word.length : line.trimEnd().length) };
}

const sameDiagnostic = (a: Diagnostic, b: Diagnostic) =>
  a.code === b.code && a.range.start === b.range.start && a.range.end === b.range.end;

/**
 * The parse's diagnostics with the preprocess ones (front matter, directives) it did not
 * report itself, in source order (preprocess first on a tie). A facet may leave preprocess
 * to the service; flowchart reports them itself and each still shows once.
 */
function withPreprocess(pre: readonly Diagnostic[], own: readonly Diagnostic[]): Diagnostic[] {
  const missing = pre.filter((p) => !own.some((d) => sameDiagnostic(p, d)));
  if (missing.length === 0) return [...own];
  const out: Diagnostic[] = [];
  let i = 0;
  for (const p of missing) {
    while (i < own.length && own[i]!.range.start < p.range.start) out.push(own[i++]!);
    out.push(p);
  }
  return [...out, ...own.slice(i)];
}

export function diagnostics(ctx: DocumentContext): Diagnostic[] {
  if (ctx.result) return withPreprocess(ctx.pre.diagnostics, ctx.result.diagnostics);
  const out = [...ctx.pre.diagnostics];
  if (ctx.entry === undefined) {
    const body = ctx.text.slice(ctx.start);
    out.push({
      severity: 'error',
      code: 'UNSUPPORTED_DIAGRAM',
      message: `No diagram type detected matching given configuration for text: ${body.slice(0, 200)}`,
      range: headerRange(ctx.text, ctx.start),
    });
  } else if (ctx.parseError !== undefined) {
    out.push({
      severity: 'error',
      code: 'LANGUAGE_FACET_FAILED',
      message: `The ${ctx.entry.id} language support failed on this text (${ctx.parseError}); only generic features are available.`,
      range: headerRange(ctx.text, ctx.start),
    });
  } else if (ctx.notLoaded) {
    out.push({
      severity: 'info',
      code: 'LANGUAGE_NOT_LOADED',
      message: `The ${ctx.entry.id} language support is not loaded: the host preloads it (\`service.preload()\`). Only generic features are available.`,
      range: headerRange(ctx.text, ctx.start),
    });
  } else if (ctx.loadError !== undefined) {
    out.push({
      severity: 'warning',
      code: 'LANGUAGE_LOAD_FAILED',
      message: `The ${ctx.entry.id} language support could not be loaded (${ctx.loadError}); only generic features are available.`,
      range: headerRange(ctx.text, ctx.start),
    });
  } else {
    out.push({
      severity: 'info',
      code: 'NO_LANGUAGE_SUPPORT',
      message: `${ctx.entry.type} diagrams are not supported by the v13 language service yet.`,
      range: headerRange(ctx.text, ctx.start),
    });
  }
  return out;
}

/**
 * A diagnostic's message as editors show it: the message, then `Expected: a, b` on its own
 * line when the parser listed what it expected (as core's `formatDiagnostic` renders it). The
 * related places stay separate (LSP `relatedInformation`, Monaco's, CodeMirror's notes).
 */
export function diagnosticMessage(d: Diagnostic): string {
  return d.expected?.length ? `${d.message}\nExpected: ${d.expected.join(', ')}` : d.message;
}
