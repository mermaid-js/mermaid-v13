/**
 * The v12 side of mindmap parity (spec #294): mermaid\@12's `MindmapDB`, driven through the
 * oracle. The snapshot walks the tree from `getMindmap()` depth-first (v12 kept no flat list
 * in that order apart from its private `nodes`, which is the same order) and copies:
 *
 * - `nodeId`, `descr` with v12's `encodeEntities` placeholders decoded, as v13 reads them (the
 *   oracle's DOMPurify is the identity, so `sanitizeText` changes nothing);
 * - the shape from v12's `nodeType` number, `level` (indent less the root's), the parent;
 * - `class` split into words (v12 wrote it whole into the class attribute), `icon` as stored;
 * - the sections `assignSections` gives with `colorBy` branch and depth (called on the DB here:
 *   v12 ran it in `getData`).
 */
import { v12DecodeEntities } from '../v12-entities.ts';

/** `diagram.type` values mermaid\@12 reports for mindmap sources. */
export const MINDMAP_V12_TYPES = ['mindmap'];

export interface MindmapNodeSnapshot {
  id: string;
  label: string;
  shape: string;
  level: number;
  /** Index of the parent in the snapshot's `nodes`; -1 for the root. */
  parent: number;
  classes: string[];
  icon: string | null;
  section: number | null;
  depthSection: number | null;
}

/** The plain-data form both sides of mindmap parity normalise to. */
export interface MindmapSnapshot {
  nodes: MindmapNodeSnapshot[];
}

interface MindmapNodeV12 {
  nodeId: string;
  descr: string;
  type: number;
  level: number;
  children: MindmapNodeV12[];
  class?: string;
  icon?: string;
  section?: number;
}

interface MindmapDbV12 {
  getMindmap(): MindmapNodeV12 | null;
  assignSections(node: MindmapNodeV12, section?: number, depth?: number, byDepth?: boolean): void;
}

/** v12's `nodeType` numbers, by name (`DEFAULT` and `NO_BORDER` are both 0). */
const SHAPES = ['default', 'rounded', 'rect', 'circle', 'cloud', 'bang', 'hexagon'];

/** HTML class-attribute words. */
export const classWords = (text = ''): string[] =>
  text.split(/[\t\n\f\r ]+/).filter((w) => w !== '');

export function mindmapV12Snapshot(dbValue: unknown): MindmapSnapshot {
  const db = dbValue as MindmapDbV12;
  const root = db.getMindmap();
  const nodes: MindmapNodeSnapshot[] = [];
  if (!root) return { nodes };
  const order: MindmapNodeV12[] = [];
  const walk = (n: MindmapNodeV12, parent: number) => {
    const index = order.length;
    order.push(n);
    nodes.push({
      id: v12DecodeEntities(n.nodeId),
      label: v12DecodeEntities(n.descr),
      shape: SHAPES[n.type] ?? `type ${n.type}`,
      level: n.level,
      parent,
      classes: classWords(n.class),
      icon: n.icon ?? null,
      section: null,
      depthSection: null,
    });
    for (const c of n.children) walk(c, index);
  };
  walk(root, -1);
  db.assignSections(root, undefined, 0, false);
  order.forEach((n, k) => ((nodes[k] as MindmapNodeSnapshot).section = n.section ?? null));
  db.assignSections(root, undefined, 0, true);
  order.forEach((n, k) => ((nodes[k] as MindmapNodeSnapshot).depthSection = n.section ?? null));
  return { nodes };
}
