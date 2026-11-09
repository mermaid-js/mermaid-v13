/**
 * The v12 side of treeView parity: a plain-data snapshot of mermaid\@12's treeView DB, in the
 * shape both sides map to (spec #518 T2): `getRoot()` as a preorder list of
 * `[depth, name, nodeType, icon, cssClass, description]` (the virtual root `/` left out, its
 * children at depth 0), `getCount()`, `getAccTitle()`, `getAccDescription()` and
 * `getDiagramTitle()`.
 *
 * Normalisation: text has v12's `encodeEntities` placeholders decoded back to what the author
 * wrote; an absent field is `null`. The title is the in-text one: the oracle never passes the
 * front matter on, so `getDiagramTitle()` holds no front-matter title (the v13 side leaves it
 * out too). Descriptions are the raw text: v12's `sanitizeText` is identity in the oracle.
 */
import { decodeEntities as d } from '../flowchart/v12.ts';

/** `diagram.type` values mermaid\@12 reports for treeView sources. */
export const TREEVIEW_V12_TYPES = ['treeView'];

export type TreeViewRow = [
  depth: number,
  name: string,
  nodeType: string,
  icon: string | null,
  cssClass: string | null,
  description: string | null,
];

export interface TreeViewSnapshot {
  rows: TreeViewRow[];
  count: number;
  title: string;
  accTitle: string;
  accDescr: string;
}

interface TreeViewNodeV12 {
  name: string;
  nodeType: string;
  icon?: string;
  cssClass?: string;
  description?: string;
  children: TreeViewNodeV12[];
}

interface TreeViewDbV12 {
  getRoot(): TreeViewNodeV12;
  getCount(): number;
  getDiagramTitle(): string;
  getAccTitle(): string;
  getAccDescription(): string;
}

const opt = (v: string | undefined) => (v === undefined ? null : d(v));

export function treeViewV12Snapshot(dbValue: unknown): TreeViewSnapshot {
  const db = dbValue as TreeViewDbV12;
  const rows: TreeViewRow[] = [];
  // Iterative preorder: a tree may be deep.
  const stack: [TreeViewNodeV12, number][] = [...db.getRoot().children]
    .reverse()
    .map((n) => [n, 0]);
  for (let top = stack.pop(); top; top = stack.pop()) {
    const [n, depth] = top;
    rows.push([depth, d(n.name), n.nodeType, opt(n.icon), opt(n.cssClass), opt(n.description)]);
    for (let k = n.children.length - 1; k >= 0; k--) {
      const c = n.children[k];
      if (c) stack.push([c, depth + 1]);
    }
  }
  return {
    rows,
    count: db.getCount(),
    title: d(db.getDiagramTitle()),
    accTitle: d(db.getAccTitle()),
    accDescr: d(db.getAccDescription()),
  };
}
