/**
 * The v13 side of ishikawa parity: the ishikawa parser and the normaliser from its
 * `IshikawaModel` to the {@link IshikawaSnapshot} that `v12.ts` takes from mermaid\@12's DB.
 */
import { detectIshikawa, parseIshikawa } from '@mermaid-js/diagram-ishikawa';
import type { IshikawaCause, IshikawaModel } from '@mermaid-js/diagram-ishikawa';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { DiagramAdapter } from '../types.ts';
import { ISHIKAWA_V12_TYPES, ishikawaV12Snapshot } from './v12.ts';
import type { IshikawaSnapshot } from './v12.ts';

/**
 * The model as v12's DB held it: the effect and the causes in pre-order by depth, and v12's
 * title, the effect's text (D492 keeps the two apart in v13; `model.title` is the front matter's,
 * which the oracle never passes to v12).
 */
export function ishikawaV13Snapshot(model: IshikawaModel): IshikawaSnapshot {
  const nodes: [number, string][] = [];
  if (model.effect) nodes.push([0, model.effect.text]);
  const todo: [IshikawaCause, number][] = [];
  const push = (causes: readonly IshikawaCause[], depth: number) => {
    for (let k = causes.length - 1; k >= 0; k--) {
      const c = causes[k];
      if (c) todo.push([c, depth]);
    }
  };
  push(model.causes, 1);
  for (let next = todo.pop(); next; next = todo.pop()) {
    const [cause, depth] = next;
    nodes.push([depth, cause.text]);
    push(cause.causes, depth + 1);
  }
  return { nodes, title: model.effect?.text ?? '' };
}

/** v13 parse for parity: the model, or a throw carrying the first error diagnostic. */
export function parseIshikawaForParity(text: string): IshikawaModel {
  const pre = preprocess(text);
  const result = parseIshikawa(text, { preprocessed: pre });
  const error = [...pre.diagnostics, ...result.diagnostics].find((x) => x.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return result.model;
}

export const ishikawaAdapter: DiagramAdapter<IshikawaModel> = {
  id: 'ishikawa',
  v12Types: ISHIKAWA_V12_TYPES,
  detect: (text) => detectIshikawa(text),
  parse: parseIshikawaForParity,
  normaliseV13: ishikawaV13Snapshot,
  normaliseV12: ishikawaV12Snapshot,
};
