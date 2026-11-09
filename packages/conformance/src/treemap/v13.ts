/**
 * The v13 side of treemap parity: the treemap parser and the normaliser from its
 * `TreemapModel` to the {@link TreemapSnapshot} that `v12.ts` takes from mermaid\@12's DB.
 */
import { detectTreemap, parseTreemap } from '@mermaid-js/diagram-treemap';
import { classStyles } from '@mermaid-js/diagram-treemap/testing';
import type { TreemapModel, TreemapNode } from '@mermaid-js/diagram-treemap';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { DiagramAdapter } from '../types.ts';
import { TREEMAP_V12_TYPES, treemapV12Snapshot } from './v12.ts';
import type { TreemapNodeSnapshot, TreemapSnapshot } from './v12.ts';

export function treemapV13Snapshot(model: TreemapModel): TreemapSnapshot {
  const node = (n: TreemapNode): TreemapNodeSnapshot => {
    const out: TreemapNodeSnapshot = { name: n.name };
    if (n.value !== undefined) out.value = n.value;
    if (n.classSelector !== undefined) out.classSelector = n.classSelector;
    const styles = classStyles(model, n.classSelector);
    if (styles.length > 0) out.styles = [...styles];
    if (n.type === 'Section') out.children = n.children.map(node);
    return out;
  };
  return {
    roots: model.roots.map(node),
    classes: model.classes.map((c) => ({
      id: c.name,
      styles: [...c.styles],
      textStyles: [...c.textStyles],
    })),
    title: model.title ?? '',
    accTitle: model.accTitle,
    accDescr: model.accDescr,
  };
}

/**
 * v13 parse for parity: the model, or a throw carrying the first error diagnostic. The
 * front-matter title is held back, as the oracle holds it back from v12 (see `v12.ts`); the
 * D218 fallback has its own specs in `parser.spec.ts`.
 */
export function parseTreemapForParity(text: string): TreemapModel {
  const pre = preprocess(text);
  const fm = pre.frontMatter && { ...pre.frontMatter, title: undefined };
  const result = parseTreemap(text, { preprocessed: { ...pre, frontMatter: fm } });
  const error = [...pre.diagnostics, ...result.diagnostics].find((x) => x.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return result.model;
}

export const treemapAdapter: DiagramAdapter<TreemapModel> = {
  id: 'treemap',
  v12Types: TREEMAP_V12_TYPES,
  detect: (text) => detectTreemap(text),
  parse: parseTreemapForParity,
  normaliseV13: treemapV13Snapshot,
  normaliseV12: treemapV12Snapshot,
};
