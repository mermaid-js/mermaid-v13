/**
 * Lean against full parses (DESIGN §4.2): what a diagram that parses lean must keep, for one
 * text. Shared by each type's lean spec (`src/<type>/lean.spec.ts`).
 *
 * For a text the full parse accepts, the lean parse with ids gives the same model, and without
 * ids the same model once {@link LeanSubject.withoutIds} blanks the ids only `data-ast` reads;
 * both give the same warnings (code, message, range, order), `embeds` and `edgeCount`. A lean
 * parse has an error exactly when the full parse has one.
 */
import { isDeepStrictEqual } from 'node:util';
import type {
  AstNode,
  Diagnostic,
  LeanParseResult,
  ParseOutput,
  ParseResult,
} from '@mermaid-js/core/parser-kit';

/** One diagram type's parser, as a lean spec drives it. */
export interface LeanSubject<M> {
  readonly full: (text: string) => ParseResult<M, AstNode>;
  readonly lean: (text: string, astIds: boolean) => LeanParseResult<M>;
  /** `model` with every AST id a lean parse without ids leaves out set to `NO_AST_ID`. */
  readonly withoutIds: (model: M) => M;
}

const failed = (r: ParseOutput<unknown>): boolean =>
  r.diagnostics.some((d) => d.severity === 'error');

const warnings = (r: ParseOutput<unknown>): Diagnostic[] =>
  r.diagnostics.filter((d) => d.severity === 'warning');

/** How `lean` differs from `full`, whose model with the ids `lean` was asked for is `model`. */
function compare<M>(full: ParseResult<M, AstNode>, lean: LeanParseResult<M>, model: M): string[] {
  const out: string[] = [];
  if (!isDeepStrictEqual(lean.model, model)) out.push('model differs');
  if (!isDeepStrictEqual(warnings(lean), warnings(full))) out.push('warnings differ');
  if (!isDeepStrictEqual(lean.embeds, full.embeds)) out.push('embeds differ');
  if (lean.edgeCount !== full.edgeCount) out.push('edgeCount differs');
  return out;
}

/** What `lean` gives other than `full` for `text`; empty when they agree. */
export function leanDifferences<M>(subject: LeanSubject<M>, text: string): string[] {
  const full = subject.full(text);
  return [true, false].flatMap((astIds) => {
    const lean = subject.lean(text, astIds);
    const label = astIds ? 'lean with ids' : 'lean';
    if (failed(lean) !== failed(full))
      return [`${label}: error ${failed(lean)}, full ${failed(full)}`];
    // A lean result with an error is never drawn: the full parse reports it.
    if (failed(full)) return [];
    const model = astIds ? full.model : subject.withoutIds(full.model);
    return compare(full, lean, model).map((d) => `${label}: ${d}`);
  });
}
