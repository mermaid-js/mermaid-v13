/**
 * Diagram id → its first-paint Monarch file (D134), a copy of gen-grammar's
 * `<id>.monarch.json` (`src/generated/<id>.monarch.js`) imported on demand. This table is the
 * list: `scripts/monarch.ts` copies the file of each id in it, and the keys are the
 * first-party facet ids, so a port's new facet does not compile here until it has its row
 * (`agents/port-diagram/language.md`). Which header picks a type comes from the facets'
 * detectors (`highlighters.ts`).
 */
import type { FirstPartyFacetId } from '@mermaid-js/language-service';

/** One generated Monarch rule: a pattern and its action. */
type MonarchRule = readonly [
  string,
  { readonly token: string; readonly next?: string; readonly switchTo?: string },
];

/** A generated Monarch file (gen-grammar's `<id>.monarch.json`). */
export interface MonarchDefinition {
  readonly tokenPostfix?: string;
  readonly defaultToken?: string;
  readonly ignoreCase?: boolean;
  readonly includeLF?: boolean;
  readonly start?: string;
  readonly tokenizer: Readonly<Record<string, readonly MonarchRule[]>>;
}

export interface MonarchHighlighter {
  /** Imports the type's generated Monarch file. */
  load(): Promise<MonarchDefinition>;
}

export const MONARCH_HIGHLIGHTERS: Readonly<Record<FirstPartyFacetId, MonarchHighlighter>> = {
  flowchart: { load: () => import('./generated/flowchart.monarch.js').then((m) => m.default) },
  sequence: { load: () => import('./generated/sequence.monarch.js').then((m) => m.default) },
  class: { load: () => import('./generated/class.monarch.js').then((m) => m.default) },
  state: { load: () => import('./generated/state.monarch.js').then((m) => m.default) },
  er: { load: () => import('./generated/er.monarch.js').then((m) => m.default) },
  pie: { load: () => import('./generated/pie.monarch.js').then((m) => m.default) },
};
