/**
 * Where mermaid\@12 reported a usecase error, and how v13 must agree (D473): v12 threw one
 * error, with its location in the text its lexer read; v13 reports every error as a diagnostic
 * with a source range. Parity is on the first error's offset, not on the message text, except
 * that a model-builder message is v12's minus its location suffix.
 *
 * - A lexer error (`Error lexing …`): v12 lexed before parsing, so its first lexer error came
 *   first whatever the parser would have said; v13 must report an error there.
 * - A parser error (`Error parsing …`): v13's first syntax error (any error but the model's)
 *   must start there.
 * - A model-builder error: v13 must report the same message there (v12 stopped at the first in
 *   its own order, v13 reports them all).
 * - A JSON error (`Invalid JSON: … (line L, column C)`, the location of v8's `JSON.parse`
 *   message): v13 must report invalid JSON there.
 */
import type { Diagnostic } from '@mermaid-js/core/parser-kit';
import { MODEL_CODES, USECASE_INVALID_JSON } from '@mermaid-js/diagram-usecase';
import { lexText, usecaseView } from '@mermaid-js/diagram-usecase/testing';
import { shownV12 } from './v12.ts';

export type V12ErrorKind = 'lexer' | 'parser' | 'model' | 'json';

export interface V12Error {
  kind: V12ErrorKind;
  /** The source offset v12's location stands for. */
  at: number;
  /** For a model error: the message without its location, as v13 words it. */
  message?: string;
}

/** v12's `locationText`, and a conflict's tail. */
const LOCATION = / at line \d+, column \d+ \[\d+,\d+\)/g;
const PREVIOUS = /; previous declaration.*$/s;

/** What v12's error says, or undefined when it is not a usecase error (detection failed). */
export function readV12Error(source: string, error: string): V12Error | undefined {
  const { bodyStart, view } = usecaseView(source);
  const input = lexText(source, bodyStart, view);
  const toSource = (k: number) => (k >= input.text.length - 1 ? source.length : input.start(k));
  const json = /^Invalid JSON: .*\(line (\d+), column (\d+)\)$/s.exec(error);
  if (json) {
    const lines = input.text.split('\n');
    let k = Number(json[2]) - 1;
    for (let l = 0; l < Number(json[1]) - 1; l++) k += (lines[l] ?? '').length + 1;
    return { kind: 'json', at: toSource(k) };
  }
  const at = /\[(\d+),\d+\)/.exec(error);
  if (!at) return undefined;
  const offset = toSource(Number(at[1]));
  if (error.startsWith('Error lexing')) return { kind: 'lexer', at: offset };
  if (error.startsWith('Error parsing')) return { kind: 'parser', at: offset };
  const message = shownV12(error.replace(PREVIOUS, '').replace(LOCATION, ''));
  return { kind: 'model', at: offset, message };
}

/** Why v13's diagnostics disagree with v12's error, or undefined when they agree. */
export function firstErrorProblem(
  v12: V12Error,
  diagnostics: readonly Diagnostic[]
): string | undefined {
  const errors = diagnostics.filter((d) => d.severity === 'error');
  const at = (d: Diagnostic) => d.range.start === v12.at;
  const list = () => errors.map((d) => `${d.code}@${d.range.start}`).join(', ');
  if (v12.kind === 'parser') {
    const first = errors.find((d) => !MODEL_CODES.has(d.code));
    return first && at(first) ? undefined : `v12's parser error at ${v12.at}; v13: ${list()}`;
  }
  if (v12.kind === 'lexer') {
    return errors.some(at) ? undefined : `v12's lexer error at ${v12.at}; v13: ${list()}`;
  }
  if (v12.kind === 'json') {
    return errors.some((d) => at(d) && d.code === USECASE_INVALID_JSON)
      ? undefined
      : `v12's JSON error at ${v12.at}; v13: ${list()}`;
  }
  return errors.some((d) => at(d) && d.message === v12.message)
    ? undefined
    : `v12's "${v12.message}" at ${v12.at}; v13: ${errors.map((d) => `${d.range.start} ${d.message}`).join(' | ')}`;
}
