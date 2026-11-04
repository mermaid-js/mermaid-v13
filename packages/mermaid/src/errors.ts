import { MermaidError } from '@mermaid-js/core';
import { asLimitError } from '@mermaid-js/core/limits';

/** Any error as the API rejects with it: a `MermaidError`, LIMIT for a limit, else INTERNAL. */
export function toMermaidError(e: unknown): MermaidError {
  if (e instanceof MermaidError) return e;
  // A LimitError (source/output size, a stack overflow from deep nesting) is LIMIT; any other
  // RangeError (e.g. a NaN coordinate from the writer) is an internal error.
  const limit = asLimitError(e);
  if (limit) return new MermaidError('LIMIT', limit.message, { cause: limit });
  return new MermaidError('INTERNAL', e instanceof Error ? e.message : String(e), { cause: e });
}
