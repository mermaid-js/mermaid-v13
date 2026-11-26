import { MermaidError, type RenderContext, type Warning } from '@mermaid-js/core';
import type { ConfigFragment } from '@mermaid-js/core/config';
import { asLimitError } from '@mermaid-js/core/limits';
import type { Plain } from './config-snapshot.ts';

/** Any error as the API rejects with it: a `MermaidError`, LIMIT for a limit, else INTERNAL. */
export function toMermaidError(e: unknown): MermaidError {
  if (e instanceof MermaidError) return e;
  // A LimitError (source/output size, a stack overflow from deep nesting) is LIMIT; any other
  // RangeError (e.g. a NaN coordinate from the writer) is an internal error.
  const limit = asLimitError(e);
  if (limit) return new MermaidError('LIMIT', limit.message, { cause: limit });
  return new MermaidError('INTERNAL', e instanceof Error ? e.message : String(e), { cause: e });
}

/** The error for a diagram type this mermaid has no package for. */
export function unsupportedDiagram(type: string): MermaidError {
  return new MermaidError(
    'UNSUPPORTED_DIAGRAM',
    `Diagram type "${type}" is not supported by this version of mermaid.`
  );
}

const WARNING_KEYS = ['path', 'source', 'feature', 'shapes', 'astIds'] as const;

/**
 * The package a warning of core's is about, which core never names (D153, as D173), while no
 * registered fragment declares the key that package owns (its own fragment, or any that takes
 * the key): `@mermaid-js/plugin-hand-drawn` for `LOOK_REMOVED`, `@mermaid-js/plugin-html-labels`
 * for a removed `htmlLabels` key (D700). One template for both, to save bytes (R-PERF-8).
 */
function hint(w: Warning, fragments: readonly ConfigFragment[]): string {
  const html = w.code === 'CONFIG_REMOVED_KEY' && w.path?.endsWith('htmlLabels');
  const key = html ? 'html' : w.code === 'LOOK_REMOVED' && 'handDrawn';
  return !key || fragments.some((f) => key in f.keys)
    ? ''
    : ` For ${html ? 'HTML labels' : key}, register @mermaid-js/plugin-${html ? 'html-labels' : 'hand-drawn'}.`;
}

/**
 * A copy of a warning with only the `Warning` keys (text output adds `feature`, `shapes`, `astIds`),
 * its message ending with the package it is about ({@link hint}).
 */
export const toWarning = (w: Warning, fragments: readonly ConfigFragment[]): Warning => {
  const out: Plain = { code: w.code, message: w.message + hint(w, fragments) };
  for (const k of WARNING_KEYS) {
    const v = w[k];
    if (v !== undefined) out[k] = Array.isArray(v) ? [...(v as unknown[])] : v;
  }
  return out as unknown as Warning;
};

/** A draw's context as the API builds it: the render's inline spans are always there. */
export type DrawContext = RenderContext & Required<Pick<RenderContext, 'inline'>>;

/** Warns once, as `HTML_DROPPED`, of the tags the labels of `ctx`'s draw lost (D566). */
export function warnHtmlDropped(ctx: DrawContext): void {
  const tags = [...ctx.inline.dropped];
  if (tags[0])
    ctx.warn({
      code: 'HTML_DROPPED',
      message: `Labels do not draw <${tags.join('>, <')}>.${tags.includes('a') ? ' For a link, use click id "url".' : ''}`,
    });
}
