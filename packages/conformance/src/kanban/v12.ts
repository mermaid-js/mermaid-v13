/**
 * The v12 side of kanban parity (spec #424): mermaid\@12's kanban DB, driven through the
 * oracle. The snapshot is `getData()`'s node list in its order (each column, then the cards v12
 * listed under it), with the column fields `getData` drops (`assigned`, `priority`, `icon`, the
 * classes) taken from `getSections()`:
 *
 * - ids, labels and `parentId` with v12's `encodeEntities` placeholders decoded, as v13 reads
 *   them (the oracle's DOMPurify is the identity, so `sanitizeText` changes nothing);
 * - `ticket`, `assigned` and `icon` as stored (v12 `toString()`ed them), `priority` as a string
 *   or, for any other value, as JSON (`v13.ts` reads v13's YAML text back to compare values);
 * - classes split into words, for columns only: `getData` keeps none for cards.
 *
 * v12 lists every card whose `parentId` is a column's id under that column, so columns that
 * share an id each list the cards of all of them; v13 groups cards by position (D373), and those
 * sources are listed divergences.
 */
import { decodeEntities } from '../flowchart/v12.ts';

/** `diagram.type` values mermaid\@12 reports for kanban sources. */
export const KANBAN_V12_TYPES = ['kanban'];

export interface KanbanItemSnapshot {
  column: boolean;
  id: string;
  label: string;
  level: number;
  parentId: string | null;
  ticket: string | null;
  assigned: string | null;
  priority: string | null;
  icon: string | null;
  /** Column classes; null for a card. */
  classes: string[] | null;
}

/** The plain-data form both sides of kanban parity normalise to. */
export interface KanbanSnapshot {
  nodes: KanbanItemSnapshot[];
}

interface KanbanNodeV12 {
  id: string;
  label?: unknown;
  level: number;
  isGroup: boolean;
  parentId?: string;
  ticket?: string;
  assigned?: string;
  priority?: unknown;
  icon?: string;
  cssClasses?: string;
}

interface KanbanDbV12 {
  getData(): { nodes: KanbanNodeV12[] };
  getSections(): KanbanNodeV12[];
}

/** HTML class-attribute words. */
const classWords = (text = ''): string[] => text.split(/[\t\n\f\r ]+/).filter((w) => w !== '');

const text = (v: unknown): string | null => (typeof v === 'string' ? decodeEntities(v) : null);

/** A priority by value: a string as it is (placeholders decoded), any other value as JSON. */
export function priorityText(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  return typeof v === 'string' ? decodeEntities(v) : JSON.stringify(v);
}

export function kanbanV12Snapshot(dbValue: unknown): KanbanSnapshot {
  const db = dbValue as KanbanDbV12;
  const sections = db.getSections();
  let k = -1;
  const nodes = db.getData().nodes.map((n): KanbanItemSnapshot => {
    const section = n.isGroup ? sections[++k] : undefined;
    const from = section ?? n;
    return {
      column: n.isGroup,
      id: decodeEntities(n.id),
      label: text(n.label) ?? '',
      level: n.level,
      parentId: text(n.parentId),
      ticket: text(from.ticket),
      assigned: text(from.assigned),
      priority: priorityText(from.priority),
      icon: text(from.icon),
      classes: section ? classWords(section.cssClasses) : null,
    };
  });
  return { nodes };
}
