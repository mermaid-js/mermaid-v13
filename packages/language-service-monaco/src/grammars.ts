/**
 * Diagram id → its first-paint Monarch file (D134), a copy of gen-grammar's
 * `<id>.monarch.json` (`src/generated/<id>.monarch.js`) imported on demand. The map at the end
 * of this file is generated: `scripts/monarch.ts` writes a row for each diagram package whose
 * manifest has a `language` entry (`pnpm --filter @mermaid-js/language-service-monaco gen`).
 * The keys are the first-party facet ids, so a facet with no row does not compile here. Which
 * header picks a type comes from the facets' detectors (`highlighters.ts`).
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
  class: { load: () => import('./generated/class.monarch.js').then((m) => m.default) },
  cynefin: { load: () => import('./generated/cynefin.monarch.js').then((m) => m.default) },
  er: { load: () => import('./generated/er.monarch.js').then((m) => m.default) },
  flowchart: { load: () => import('./generated/flowchart.monarch.js').then((m) => m.default) },
  gantt: { load: () => import('./generated/gantt.monarch.js').then((m) => m.default) },
  gitGraph: { load: () => import('./generated/gitGraph.monarch.js').then((m) => m.default) },
  info: { load: () => import('./generated/info.monarch.js').then((m) => m.default) },
  ishikawa: { load: () => import('./generated/ishikawa.monarch.js').then((m) => m.default) },
  journey: { load: () => import('./generated/journey.monarch.js').then((m) => m.default) },
  kanban: { load: () => import('./generated/kanban.monarch.js').then((m) => m.default) },
  mindmap: { load: () => import('./generated/mindmap.monarch.js').then((m) => m.default) },
  packet: { load: () => import('./generated/packet.monarch.js').then((m) => m.default) },
  pie: { load: () => import('./generated/pie.monarch.js').then((m) => m.default) },
  quadrantChart: {
    load: () => import('./generated/quadrantChart.monarch.js').then((m) => m.default),
  },
  radar: { load: () => import('./generated/radar.monarch.js').then((m) => m.default) },
  sankey: { load: () => import('./generated/sankey.monarch.js').then((m) => m.default) },
  sequence: { load: () => import('./generated/sequence.monarch.js').then((m) => m.default) },
  state: { load: () => import('./generated/state.monarch.js').then((m) => m.default) },
  timeline: { load: () => import('./generated/timeline.monarch.js').then((m) => m.default) },
  treemap: { load: () => import('./generated/treemap.monarch.js').then((m) => m.default) },
  usecase: { load: () => import('./generated/usecase.monarch.js').then((m) => m.default) },
  venn: { load: () => import('./generated/venn.monarch.js').then((m) => m.default) },
  wardley: { load: () => import('./generated/wardley.monarch.js').then((m) => m.default) },
  xychart: { load: () => import('./generated/xychart.monarch.js').then((m) => m.default) },
};
