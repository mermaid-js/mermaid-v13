/**
 * `CALLBACK_IGNORED` (D47, D226): gantt's `click … call` runs only when an extension plugin
 * claims `callbacks` (the interactions plugin). Otherwise the parse warns once, at the first
 * `click` with a `call`, as class and flowchart do.
 */
import type { Diagnostic } from '@mermaid-js/core/parser-kit';
import type { GanttParseResult } from './parser.ts';

const MESSAGE = '`click … call` is ignored: install the interactions plugin to run callbacks.';

/** `result` with the warning added to its diagnostics and model, unless `claims` has `callbacks`. */
export function withCallbackClaims(
  result: GanttParseResult,
  claims: readonly string[] | undefined
): GanttParseResult {
  const call = result.model.clicks.find((c) => c.call !== undefined);
  if (call === undefined || claims?.includes('callbacks')) return result;
  const warning: Diagnostic = {
    severity: 'warning',
    code: 'CALLBACK_IGNORED',
    message: MESSAGE,
    range: call.range,
  };
  return {
    ...result,
    model: { ...result.model, warnings: [...result.model.warnings, warning] },
    diagnostics: [...result.diagnostics, warning],
  };
}
