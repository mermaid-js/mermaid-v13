/**
 * The v12 side of treemap parity: a plain-data snapshot of mermaid\@12's treemap DB
 * (`getRoot()`, `getClasses()`, the title and accessibility), in the shape both sides map to.
 *
 * Normalisation, chosen so the snapshot holds what v12 drew and nothing else:
 * - text has v12's `encodeEntities` placeholders decoded back to what the author wrote;
 * - a node keeps its name, value (leaves only), class selector, the styles v12 compiled for it
 *   (`cssCompiledStyles`) and its children (sections only, maybe none);
 * - the title is the in-text one: the oracle never passes the front matter on, so
 *   `getDiagramTitle()` holds no front-matter title (the v13 side leaves it out too).
 */
import { v12DecodeEntities as d } from '../v12-entities.ts';

/** `diagram.type` values mermaid\@12 reports for treemap sources. */
export const TREEMAP_V12_TYPES = ['treemap'];

export interface TreemapNodeSnapshot {
  name: string;
  value?: number;
  classSelector?: string;
  styles?: string[];
  children?: TreemapNodeSnapshot[];
}

export interface TreemapSnapshot {
  roots: TreemapNodeSnapshot[];
  classes: { id: string; styles: string[]; textStyles: string[] }[];
  title: string;
  accTitle: string;
  accDescr: string;
}

interface TreemapNodeV12 {
  name: string;
  value?: number;
  classSelector?: string;
  cssCompiledStyles?: string[];
  children?: TreemapNodeV12[];
}

interface TreemapDbV12 {
  getRoot(): { children?: TreemapNodeV12[] };
  getClasses(): Map<string, { id: string; styles?: string[]; textStyles?: string[] }>;
  getDiagramTitle(): string;
  getAccTitle(): string;
  getAccDescription(): string;
}

function node(n: TreemapNodeV12): TreemapNodeSnapshot {
  const out: TreemapNodeSnapshot = { name: d(n.name) };
  if (n.value !== undefined) out.value = n.value;
  if (n.classSelector !== undefined) out.classSelector = n.classSelector;
  if (n.cssCompiledStyles) out.styles = n.cssCompiledStyles.map(d);
  if (n.children) out.children = n.children.map(node);
  return out;
}

export function treemapV12Snapshot(dbValue: unknown): TreemapSnapshot {
  const db = dbValue as TreemapDbV12;
  return {
    roots: (db.getRoot().children ?? []).map(node),
    classes: [...db.getClasses().values()].map((c) => ({
      id: c.id,
      styles: (c.styles ?? []).map(d),
      textStyles: (c.textStyles ?? []).map(d),
    })),
    title: d(db.getDiagramTitle()),
    accTitle: d(db.getAccTitle()),
    accDescr: d(db.getAccDescription()),
  };
}
