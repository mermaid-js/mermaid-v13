/**
 * The v13 side of venn parity: the venn parser and the normaliser from its `VennModel` to the
 * {@link VennSnapshot} that `v12.ts` takes from mermaid\@12's DB.
 */
import { detectVenn, parseVenn } from '@mermaid-js/diagram-venn';
import type { VennModel, VennTitleNode } from '@mermaid-js/diagram-venn';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { DiagramAdapter } from '../types.ts';
import { VENN_V12_TYPES, vennV12Snapshot } from './v12.ts';
import type { VennSnapshot } from './v12.ts';

/** A parse for parity: the model, and the last in-text title as v12 kept it (before D416). */
export interface VennParity {
  model: VennModel;
  v12Title: string;
}

export function vennV13Snapshot({ model, v12Title }: VennParity): VennSnapshot {
  return {
    subsets: model.subsets.map((s) => [[...s.sets], s.size, s.label ?? null]),
    textNodes: model.textNodes.map((t) => [[...t.sets], t.id, t.label ?? null]),
    styles: model.styles.map((s) => [[...s.targets], Object.entries(s.properties)]),
    title: v12Title,
  };
}

/**
 * v13 parse for parity: the model, or a throw carrying the first error diagnostic. The
 * front-matter title is held back, as the oracle holds it back from v12 (see `v12.ts`); D218's
 * fallback and D416's quote removal have their own specs in the venn package, so the title
 * compared is the last in-text one as v12 kept it, read from the AST.
 */
export function parseVennForParity(text: string): VennParity {
  const pre = preprocess(text);
  const fm = pre.frontMatter && { ...pre.frontMatter, title: undefined };
  const result = parseVenn(text, { preprocessed: { ...pre, frontMatter: fm } });
  const error = [...pre.diagnostics, ...result.diagnostics].find((x) => x.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  const titles = result.ast.children.filter((c): c is VennTitleNode => c.type === 'Title');
  return { model: result.model, v12Title: titles[titles.length - 1]?.text ?? '' };
}

export const vennAdapter: DiagramAdapter<VennParity> = {
  id: 'venn',
  v12Types: VENN_V12_TYPES,
  detect: (text) => detectVenn(text),
  parse: parseVennForParity,
  normaliseV13: vennV13Snapshot,
  normaliseV12: vennV12Snapshot,
};
