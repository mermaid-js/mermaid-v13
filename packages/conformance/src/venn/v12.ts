/**
 * The v12 side of venn parity (spec #429): a plain-data snapshot of mermaid\@12's venn DB
 * (`getSubsetData()`, `getTextData()`, `getStyleData()`, `getDiagramTitle()`), in the shape
 * `v13.ts` takes from v13's `VennModel`, without AST ids and warnings:
 *
 * - text has v12's `encodeEntities` placeholders decoded back to what the author wrote (v13
 *   keeps entities as written: `&amp;`, and `#35;` as `&#35;`);
 * - a subset is `[sets, size, label]`, a text node `[sets, id, label]`, with `null` for no label
 *   (v12 stores `label: undefined`, v13 leaves the key out);
 * - a style is `[targets, [key, value][]]`, its properties in v12's object order;
 * - the title is the in-text one: the oracle never passes the front matter on, so
 *   `getDiagramTitle()` holds no front-matter title (the v13 side leaves it out too). v13 strips
 *   one pair of surrounding quotes from it (D416); `v13.ts` compares v13's title before that
 *   step, and the step has its own specs in the venn package.
 */
import { decodeEntities as d } from '../flowchart/v12.ts';

/** `diagram.type` values mermaid\@12 reports for venn sources (`vennDetector.ts`). */
export const VENN_V12_TYPES = ['venn'];

export interface VennSnapshot {
  subsets: [sets: string[], size: number, label: string | null][];
  textNodes: [sets: string[], id: string, label: string | null][];
  styles: [targets: string[], properties: [key: string, value: string][]][];
  title: string;
}

interface VennDbV12 {
  getSubsetData(): { sets: string[]; size: number; label?: string }[];
  getTextData(): { sets: string[]; id: string; label?: string }[];
  getStyleData(): { targets: string[]; styles: Record<string, string> }[];
  getDiagramTitle(): string;
}

const label = (v: string | undefined): string | null => (v === undefined ? null : d(v));

export function vennV12Snapshot(dbValue: unknown): VennSnapshot {
  const db = dbValue as VennDbV12;
  return {
    subsets: db.getSubsetData().map((s) => [s.sets.map(d), s.size, label(s.label)]),
    textNodes: db.getTextData().map((t) => [t.sets.map(d), d(t.id), label(t.label)]),
    styles: db
      .getStyleData()
      .map((s) => [s.targets.map(d), Object.entries(s.styles).map(([k, v]) => [d(k), d(v)])]),
    title: d(db.getDiagramTitle()),
  };
}
