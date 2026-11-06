import { MermaidError, type Warning } from '@mermaid-js/core';
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

const WARNING_KEYS = ['path', 'source', 'feature', 'shapes', 'astIds'] as const;

/**
 * A copy of a warning with only the `Warning` keys (text output adds `feature`, `shapes`, `astIds`).
 * `LOOK_REMOVED` names the hand-drawn package here, core never names one (D153, as D173), and
 * only while no registered fragment declares `handDrawn` (the plugin's, or any that takes it).
 */
export const toWarning = (w: Warning, fragments: readonly ConfigFragment[]): Warning => {
  const out: Plain = {
    code: w.code,
    message:
      w.code === 'LOOK_REMOVED' && !fragments.some((f) => 'handDrawn' in f.keys)
        ? `${w.message} For handDrawn, register @mermaid-js/plugin-hand-drawn.`
        : w.message,
  };
  for (const k of WARNING_KEYS) {
    const v = w[k];
    if (v !== undefined) out[k] = Array.isArray(v) ? [...(v as unknown[])] : v;
  }
  return out as unknown as Warning;
};
