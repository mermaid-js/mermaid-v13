/**
 * The v13 side of pie parity: the pie parser and the normaliser from its `PieModel` to the
 * {@link PieSnapshot} that `v12.ts` takes from mermaid\@12's pie DB.
 */
import { detectPie, parsePie } from '@mermaid-js/diagram-pie';
import type { PieModel } from '@mermaid-js/diagram-pie';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { DiagramAdapter } from '../types.ts';
import { PIE_V12_TYPES, pieV12Snapshot } from './v12.ts';
import type { PieSnapshot } from './v12.ts';

export function pieV13Snapshot(model: PieModel): PieSnapshot {
  return {
    showData: model.showData,
    sections: model.sections.map((s) => [s.label, s.value]),
    title: model.title ?? '',
    accTitle: model.accTitle,
    accDescr: model.accDescr,
  };
}

/**
 * v13 parse for parity: the model, or a throw carrying the first error diagnostic. The
 * front-matter title is held back, as the oracle holds it back from v12 (see `v12.ts`); the
 * D218 fallback has its own specs in the pie package.
 */
export function parsePieForParity(text: string): PieModel {
  const pre = preprocess(text);
  const fm = pre.frontMatter && { ...pre.frontMatter, title: undefined };
  const result = parsePie(text, { preprocessed: { ...pre, frontMatter: fm } });
  const error = [...pre.diagnostics, ...result.diagnostics].find((x) => x.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return result.model;
}

export const pieAdapter: DiagramAdapter<PieModel> = {
  id: 'pie',
  v12Types: PIE_V12_TYPES,
  detect: (text) => detectPie(text),
  parse: parsePieForParity,
  normaliseV13: pieV13Snapshot,
  normaliseV12: pieV12Snapshot,
};
