/**
 * The v13 side of cynefin parity: the cynefin parser and the normaliser from its
 * `CynefinModel` to the {@link CynefinSnapshot} that `v12.ts` takes from mermaid\@12's DB.
 */
import { detectCynefin, parseCynefin } from '@mermaid-js/diagram-cynefin';
import type { CynefinModel } from '@mermaid-js/diagram-cynefin';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { DiagramAdapter } from '../types.ts';
import { CYNEFIN_V12_TYPES, cynefinV12Snapshot } from './v12.ts';
import type { CynefinSnapshot } from './v12.ts';

export function cynefinV13Snapshot(model: CynefinModel): CynefinSnapshot {
  return {
    domains: model.domains.map((x) => [x.name, x.items.map((i) => i.label)]),
    transitions: model.transitions.map((t) => [t.from, t.to, t.label ?? null]),
    title: model.title ?? '',
    accTitle: model.accTitle,
    accDescr: model.accDescr,
  };
}

/**
 * v13 parse for parity: the model, or a throw carrying the first error diagnostic. The
 * front-matter title is held back, as the oracle holds it back from v12 (see `v12.ts`); the
 * D218 fallback has its own specs in the cynefin package.
 */
export function parseCynefinForParity(text: string): CynefinModel {
  const pre = preprocess(text);
  const fm = pre.frontMatter && { ...pre.frontMatter, title: undefined };
  const result = parseCynefin(text, { preprocessed: { ...pre, frontMatter: fm } });
  const error = [...pre.diagnostics, ...result.diagnostics].find((x) => x.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return result.model;
}

export const cynefinAdapter: DiagramAdapter<CynefinModel> = {
  id: 'cynefin',
  v12Types: CYNEFIN_V12_TYPES,
  detect: (text) => detectCynefin(text),
  parse: parseCynefinForParity,
  normaliseV13: cynefinV13Snapshot,
  normaliseV12: cynefinV12Snapshot,
};
