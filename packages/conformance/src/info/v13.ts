/**
 * The v13 side of info parity: the info parser, and the empty snapshot `v12.ts` takes from
 * mermaid\@12's info DB (which held only the version).
 */
import { detectInfo, parseInfo } from '@mermaid-js/diagram-info';
import type { InfoModel } from '@mermaid-js/diagram-info';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { DiagramAdapter } from '../types.ts';
import { INFO_V12_TYPES, infoV12Snapshot } from './v12.ts';
import type { InfoSnapshot } from './v12.ts';

export function infoV13Snapshot(_model: InfoModel): InfoSnapshot {
  return {};
}

/** v13 parse for parity: the model, or a throw carrying the first error diagnostic. */
export function parseInfoForParity(text: string): InfoModel {
  const pre = preprocess(text);
  const result = parseInfo(text, { preprocessed: pre });
  const error = [...pre.diagnostics, ...result.diagnostics].find((x) => x.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return result.model;
}

export const infoAdapter: DiagramAdapter<InfoModel> = {
  id: 'info',
  v12Types: INFO_V12_TYPES,
  detect: (text) => detectInfo(text),
  parse: parseInfoForParity,
  normaliseV13: infoV13Snapshot,
  normaliseV12: infoV12Snapshot,
};
