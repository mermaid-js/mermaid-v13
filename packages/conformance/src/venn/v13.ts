/**
 * The v13 side of venn parity: the venn parser and the normaliser from its `VennModel` to the
 * {@link VennSnapshot} that `v12.ts` takes from mermaid\@12's DB.
 */
import { detectVenn, parseVenn } from '@mermaid-js/diagram-venn';
import type { VennModel } from '@mermaid-js/diagram-venn';
import { parseForParity } from '../parity-parse.ts';
import type { DiagramAdapter } from '../types.ts';
import { VENN_V12_TYPES, vennV12Snapshot } from './v12.ts';
import type { VennSnapshot } from './v12.ts';

export function vennV13Snapshot(model: VennModel): VennSnapshot {
  return {
    subsets: model.subsets.map((s) => [[...s.sets], s.size, s.label ?? null]),
    textNodes: model.textNodes.map((t) => [[...t.sets], t.id, t.label ?? null]),
    styles: model.styles.map((s) => [[...s.targets], Object.entries(s.properties)]),
    title: model.title ?? '',
  };
}

/**
 * v13 parse for parity: the model, or a throw carrying the first error diagnostic. The
 * front-matter title is held back, as the oracle holds it back from v12 (see `v12.ts`); D218's
 * fallback has its own specs in the venn package. The title compared is the model's, so the last
 * one wins and D416 removes one pair of quotes: a quoted title is a listed divergence.
 */
export const parseVennForParity = (text: string): VennModel =>
  parseForParity(text, parseVenn, { withoutTitle: true });

export const vennAdapter: DiagramAdapter<VennModel> = {
  id: 'venn',
  v12Types: VENN_V12_TYPES,
  detect: (text) => detectVenn(text),
  parse: parseVennForParity,
  normaliseV13: vennV13Snapshot,
  normaliseV12: vennV12Snapshot,
};
