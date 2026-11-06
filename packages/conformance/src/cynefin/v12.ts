/**
 * The v12 side of cynefin parity: a plain-data snapshot of mermaid\@12's cynefin DB
 * (`getDomains()`, `getTransitions()`, `getDiagramTitle()`, `getAccTitle()`,
 * `getAccDescription()`), in the shape of v13's `CynefinModel` without AST ids and warnings.
 *
 * Normalisation, chosen so the snapshot holds what v12 drew and nothing else:
 * - text has v12's `encodeEntities` placeholders decoded back to what the author wrote;
 * - domains are `[name, item labels]` in the DB's (insertion) order;
 * - a transition is `[from, to, label]`, with `null` for no label: v12 stores
 *   `label: undefined` (`t.label || undefined`), v13 leaves the key out;
 * - the title is the in-text one: the oracle never passes the front matter on, so
 *   `getDiagramTitle()` holds no front-matter title (the v13 side leaves it out too).
 *
 * `getConfig()` is compared on its own, in `config.spec.ts` (#469).
 */
import { decodeEntities as d } from '../flowchart/v12.ts';

/** `diagram.type` values mermaid\@12 reports for cynefin sources (`cynefinDetector.ts`). */
export const CYNEFIN_V12_TYPES = ['cynefin'];

export interface CynefinSnapshot {
  domains: [name: string, items: string[]][];
  transitions: [from: string, to: string, label: string | null][];
  title: string;
  accTitle: string;
  accDescr: string;
}

interface CynefinDbV12 {
  getDomains(): Map<string, { name: string; items: { label: string }[] }>;
  getTransitions(): { from: string; to: string; label?: string }[];
  getDiagramTitle(): string;
  getAccTitle(): string;
  getAccDescription(): string;
}

export function cynefinV12Snapshot(dbValue: unknown): CynefinSnapshot {
  const db = dbValue as CynefinDbV12;
  return {
    domains: [...db.getDomains().values()].map((v) => [v.name, v.items.map((i) => d(i.label))]),
    transitions: db
      .getTransitions()
      .map((t) => [t.from, t.to, t.label === undefined ? null : d(t.label)]),
    title: d(db.getDiagramTitle()),
    accTitle: d(db.getAccTitle()),
    accDescr: d(db.getAccDescription()),
  };
}
