/**
 * The v12 side of block parity (spec #521): mermaid\@12's block DB, driven through the oracle.
 * The snapshot is `getBlocks()` as a tree, `getEdges()` and `getClasses()`:
 *
 * - ids, labels, classes and styles with v12's `encodeEntities` placeholders decoded, as v13
 *   reads them (the oracle's DOMPurify is the identity, so `sanitizeText` changes nothing);
 * - a block's span is `widthInColumns ?? 1` (v12's layout reads it so); a space block, one per
 *   cell, keeps v12's form, as v13's `cells` is expanded into it;
 * - v12's `Math.random` ids (`id-<random>-<count>`, spaces and anonymous composites) are
 *   renumbered by first appearance in a pre-order walk, as v13's `id-<n>` are, so the two
 *   compare by position; a space cell keeps its `-<j>` suffix and its label (the space's id).
 */
import { decodeEntities } from '../flowchart/v12.ts';

/** `diagram.type` values mermaid\@12 reports for block sources. */
export const BLOCK_V12_TYPES = ['block'];

export interface BlockSnapshotNode {
  id: string;
  type: string;
  label: string;
  span: number;
  columns: number | null;
  classes: string[];
  styles: string[];
  directions: string[] | null;
  colorIndex: number | null;
  children: BlockSnapshotNode[];
}

export interface BlockEdgeSnapshot {
  id: string;
  start: string | null;
  end: string | null;
  label: string;
  arrowTypeStart: string;
  arrowTypeEnd: string;
  thickness: string;
  pattern: string;
}

/** The plain-data form both sides of block parity normalise to. */
export interface BlockSnapshot {
  columns: number;
  blocks: BlockSnapshotNode[];
  edges: BlockEdgeSnapshot[];
  classes: { id: string; styles: string[]; textStyles: string[] }[];
}

interface BlockV12 {
  id?: string;
  type?: string;
  label?: string;
  widthInColumns?: number;
  columns?: number;
  classes?: string[];
  styles?: string[];
  directions?: string[];
  colorIndex?: number;
  children?: BlockV12[];
  start?: string;
  end?: string;
  arrowTypeStart?: string;
  arrowTypeEnd?: string;
  thickness?: string;
  pattern?: string;
}

interface BlockDbV12 {
  getBlocks(): BlockV12[];
  getEdges(): BlockV12[];
  getClasses(): Map<string, { id: string; styles: string[]; textStyles: string[] }>;
  getBlock(id: string): BlockV12 | undefined;
}

/**
 * Renames generated ids: `generated` matches one and gives its base (the part a space cell's
 * `-<j>` follows); each base becomes `id-<k>` in order of first appearance.
 */
export class IdNumbering {
  private readonly names = new Map<string, string>();
  constructor(private readonly generated: RegExp) {}

  rename(id: string): string {
    const m = this.generated.exec(id);
    if (!m) return id;
    const base = m[0];
    let name = this.names.get(base);
    if (name === undefined) this.names.set(base, (name = `id-${this.names.size + 1}`));
    return name + id.slice(base.length);
  }
}

/** Every `id`/`label` of a snapshot tree renamed, pre-order (labels after their id). */
export function renumber(blocks: BlockSnapshotNode[], ids: IdNumbering): BlockSnapshotNode[] {
  return blocks.map((b) => {
    const id = ids.rename(b.id);
    return { ...b, id, label: ids.rename(b.label), children: renumber(b.children, ids) };
  });
}

const text = (v: unknown): string => (typeof v === 'string' ? decodeEntities(v) : '');

function node(b: BlockV12): BlockSnapshotNode {
  return {
    id: text(b.id),
    type: b.type ?? '',
    label: text(b.label),
    span: b.widthInColumns ?? 1,
    columns: b.columns ?? null,
    classes: (b.classes ?? []).map(text),
    styles: (b.styles ?? []).map(text),
    directions: b.directions ? [...b.directions] : null,
    colorIndex: b.colorIndex ?? null,
    children: (b.children ?? []).map(node),
  };
}

export function blockV12Snapshot(dbValue: unknown): BlockSnapshot {
  const db = dbValue as BlockDbV12;
  const blocks = renumber(db.getBlocks().map(node), new IdNumbering(/^id-[a-z0-9]*-\d+/));
  return {
    columns: db.getBlock('root')?.columns ?? -1,
    blocks,
    edges: db.getEdges().map((e) => ({
      id: text(e.id),
      start: e.start === undefined ? null : text(e.start),
      end: e.end === undefined ? null : text(e.end),
      label: text(e.label),
      arrowTypeStart: e.arrowTypeStart ?? '',
      arrowTypeEnd: e.arrowTypeEnd ?? '',
      thickness: e.thickness ?? '',
      pattern: e.pattern ?? '',
    })),
    classes: [...db.getClasses().values()].map((c) => ({
      id: text(c.id),
      styles: c.styles.map(text),
      textStyles: c.textStyles.map(text),
    })),
  };
}
