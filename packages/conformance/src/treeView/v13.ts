/**
 * The v13 side of treeView parity: the treeView parser and the normaliser from its
 * `TreeViewModel` to the {@link TreeViewSnapshot} that `v12.ts` takes from mermaid\@12's DB.
 */
import { detectTreeView, parseTreeView } from '@mermaid-js/diagram-treeview';
import type { TreeViewModel } from '@mermaid-js/diagram-treeview';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { DiagramAdapter } from '../types.ts';
import { TREEVIEW_V12_TYPES, treeViewV12Snapshot } from './v12.ts';
import type { TreeViewSnapshot } from './v12.ts';

export function treeViewV13Snapshot(model: TreeViewModel): TreeViewSnapshot {
  return {
    rows: model.nodes.map((n) => [
      n.depth,
      n.name,
      n.directory ? 'directory' : 'file',
      n.icon ?? null,
      n.cssClass ?? null,
      n.description ?? null,
    ]),
    count: model.nodes.length + 1,
    title: model.title ?? '',
    accTitle: model.accTitle,
    accDescr: model.accDescr,
  };
}

/**
 * v13 parse for parity: the model, or a throw carrying the first error diagnostic. The
 * front-matter title is held back, as the oracle holds it back from v12 (see `v12.ts`).
 */
export function parseTreeViewForParity(text: string): TreeViewModel {
  const pre = preprocess(text);
  const fm = pre.frontMatter && { ...pre.frontMatter, title: undefined };
  const result = parseTreeView(text, { preprocessed: { ...pre, frontMatter: fm } });
  const error = [...pre.diagnostics, ...result.diagnostics].find((x) => x.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return result.model;
}

export const treeViewAdapter: DiagramAdapter<TreeViewModel> = {
  id: 'treeView',
  v12Types: TREEVIEW_V12_TYPES,
  detect: (text) => detectTreeView(text),
  parse: parseTreeViewForParity,
  normaliseV13: treeViewV13Snapshot,
  normaliseV12: treeViewV12Snapshot,
};
