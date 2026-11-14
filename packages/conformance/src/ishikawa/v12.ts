/**
 * The v12 side of ishikawa parity (spec #519): a plain-data snapshot of mermaid\@12's ishikawa
 * DB (`getRoot()`, `getDiagramTitle()`), in the shape `v13.ts` takes from v13's `IshikawaModel`,
 * without AST ids, ranges and warnings:
 *
 * - the tree as a pre-order list of `[depth, text]`, the effect (v12's root) at depth 0; v12 keeps
 *   no level on its nodes, so the depth is what both sides can compare;
 * - text with v12's `encodeEntities` placeholders decoded back to what the author wrote (v13
 *   keeps entities as written: `&amp;`, and `#35;` as `&#35;`);
 * - the title: v12 made the effect the diagram title, and the oracle never passes the front
 *   matter on, so `getDiagramTitle()` is the effect's text or empty.
 */
import { v12DecodeEntities as d } from '../v12-entities.ts';

/** `diagram.type` values mermaid\@12 reports for ishikawa sources (`ishikawaDetector.ts`). */
export const ISHIKAWA_V12_TYPES = ['ishikawa'];

export interface IshikawaSnapshot {
  nodes: [depth: number, text: string][];
  title: string;
}

interface IshikawaNodeV12 {
  text: string;
  children: IshikawaNodeV12[];
}

interface IshikawaDbV12 {
  getRoot(): IshikawaNodeV12 | undefined;
  getDiagramTitle(): string;
}

export function ishikawaV12Snapshot(dbValue: unknown): IshikawaSnapshot {
  const db = dbValue as IshikawaDbV12;
  const nodes: [number, string][] = [];
  // An explicit stack: a deep chain of causes would overflow a recursive walk.
  const todo: [IshikawaNodeV12, number][] = [];
  const root = db.getRoot();
  if (root) todo.push([root, 0]);
  for (let next = todo.pop(); next; next = todo.pop()) {
    const [node, depth] = next;
    nodes.push([depth, d(node.text)]);
    for (let k = node.children.length - 1; k >= 0; k--) {
      const child = node.children[k];
      if (child) todo.push([child, depth + 1]);
    }
  }
  return { nodes, title: d(db.getDiagramTitle()) };
}
