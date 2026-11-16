// cspell:words nonterminal
/**
 * The v12 side of railroad parity: a plain-data snapshot of mermaid\@12's railroad DB, in the
 * shape `v13.ts` builds from v13's `RailroadModel`. The four v12 types share one DB
 * (`railroadDb.ts`), so one snapshot serves the four adapters.
 *
 * Normalisation, chosen so the snapshot holds what v12 kept and nothing else:
 * - rules in order, duplicates included (`getRules()`), each definition as the seven-kind tree
 *   with only its kind's fields: v12's `sanitizeAstNode` adds `separator: undefined` to every
 *   repetition and `addRule` a `comment: undefined`, which no parser sets;
 * - `max: Infinity` is written `null`, as a JSON copy of either side would write it;
 * - text has v12's `encodeEntities` placeholders decoded back to what the author wrote (the
 *   oracle's DOMPurify is the identity, so `sanitizeText` changes nothing else);
 * - the title is the in-text one: the oracle never passes the front matter on, so
 *   `getDiagramTitle()` holds no front-matter title (the v13 side leaves it out too).
 */
import { v12DecodeEntities as d } from '../v12-entities.ts';

export type RailroadNodeSnapshot =
  | { type: 'terminal'; value: string }
  | { type: 'nonterminal'; name: string }
  | { type: 'special'; text: string }
  | { type: 'sequence'; elements: RailroadNodeSnapshot[] }
  | { type: 'choice'; alternatives: RailroadNodeSnapshot[] }
  | { type: 'optional'; element: RailroadNodeSnapshot }
  | { type: 'repetition'; element: RailroadNodeSnapshot; min: number; max: number | null };

export interface RailroadSnapshot {
  rules: { name: string; definition: RailroadNodeSnapshot }[];
  title: string;
  accTitle: string;
  accDescr: string;
}

/** A node of v12's model (`railroadTypes.ts`), or of v13's: both have these fields. */
export interface RailroadNodeLike {
  type: string;
  value?: string;
  name?: string;
  text?: string;
  elements?: readonly RailroadNodeLike[];
  alternatives?: readonly RailroadNodeLike[];
  element?: RailroadNodeLike;
  min?: number;
  max?: number;
}

/** The snapshot of one node: its kind's fields only, `Infinity` as `null`, text as `text(…)`. */
export function nodeSnapshot(
  n: RailroadNodeLike,
  text: (s: string) => string = (s) => s
): RailroadNodeSnapshot {
  const sub = (c: RailroadNodeLike | undefined) => nodeSnapshot(c ?? { type: '?' }, text);
  switch (n.type) {
    case 'terminal':
      return { type: 'terminal', value: text(n.value ?? '') };
    case 'nonterminal':
      return { type: 'nonterminal', name: text(n.name ?? '') };
    case 'special':
      return { type: 'special', text: text(n.text ?? '') };
    case 'sequence':
      return { type: 'sequence', elements: (n.elements ?? []).map(sub) };
    case 'choice':
      return { type: 'choice', alternatives: (n.alternatives ?? []).map(sub) };
    case 'optional':
      return { type: 'optional', element: sub(n.element) };
    case 'repetition': {
      const max = n.max ?? 0;
      return {
        type: 'repetition',
        element: sub(n.element),
        min: n.min ?? 0,
        max: Number.isFinite(max) ? max : null,
      };
    }
    default:
      throw new Error(`unknown railroad node kind ${n.type}`);
  }
}

interface RailroadDbV12 {
  getRules(): { name: string; definition: RailroadNodeLike }[];
  getDiagramTitle(): string;
  getAccTitle(): string;
  getAccDescription(): string;
}

export function railroadV12Snapshot(dbValue: unknown): RailroadSnapshot {
  const db = dbValue as RailroadDbV12;
  return {
    rules: db
      .getRules()
      .map((r) => ({ name: d(r.name), definition: nodeSnapshot(r.definition, d) })),
    title: d(db.getDiagramTitle()),
    accTitle: d(db.getAccTitle()),
    accDescr: d(db.getAccDescription()),
  };
}
