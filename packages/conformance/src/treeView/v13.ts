/**
 * The v13 side of treeView parity: the treeView parser and the normaliser from its
 * `TreeViewModel` to the {@link TreeViewSnapshot} that `v12.ts` takes from mermaid\@12's DB.
 */
import { detectTreeView, parseTreeView } from '@mermaid-js/diagram-treeview';
import type { TreeViewModel } from '@mermaid-js/diagram-treeview';
import { parseForParity } from '../parity-parse.ts';
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
export const parseTreeViewForParity = (text: string): TreeViewModel =>
  parseForParity(text, parseTreeView, { withoutTitle: true });

export const treeViewAdapter: DiagramAdapter<TreeViewModel> = {
  id: 'treeView',
  v12Types: TREEVIEW_V12_TYPES,
  detect: (text) => detectTreeView(text),
  parse: parseTreeViewForParity,
  normaliseV13: treeViewV13Snapshot,
  normaliseV12: treeViewV12Snapshot,
};
