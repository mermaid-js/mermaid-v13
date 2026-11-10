/**
 * Diagram id → its first-paint Lezer parser (D134), built from gen-grammar's highlighting
 * grammar (`src/generated/<id>.parser.js`) and imported on demand. The map is generated:
 * `scripts/lezer.ts` builds a parser for each diagram package whose manifest has a `language`
 * entry and writes its row (`pnpm --filter @mermaid-js/language-service-codemirror gen`). The
 * keys are the first-party facet ids, so a facet with no row does not compile here.
 */
import type { LRParser } from '@lezer/lr';
import type { FirstPartyFacetId } from '@mermaid-js/language-service';

export const LEZER_HIGHLIGHTERS: Readonly<Record<FirstPartyFacetId, () => Promise<LRParser>>> = {
  class: () => import('./generated/class.parser.js').then((m) => m.parser),
  cynefin: () => import('./generated/cynefin.parser.js').then((m) => m.parser),
  er: () => import('./generated/er.parser.js').then((m) => m.parser),
  flowchart: () => import('./generated/flowchart.parser.js').then((m) => m.parser),
  gantt: () => import('./generated/gantt.parser.js').then((m) => m.parser),
  gitGraph: () => import('./generated/gitGraph.parser.js').then((m) => m.parser),
  info: () => import('./generated/info.parser.js').then((m) => m.parser),
  ishikawa: () => import('./generated/ishikawa.parser.js').then((m) => m.parser),
  journey: () => import('./generated/journey.parser.js').then((m) => m.parser),
  kanban: () => import('./generated/kanban.parser.js').then((m) => m.parser),
  mindmap: () => import('./generated/mindmap.parser.js').then((m) => m.parser),
  packet: () => import('./generated/packet.parser.js').then((m) => m.parser),
  pie: () => import('./generated/pie.parser.js').then((m) => m.parser),
  quadrantChart: () => import('./generated/quadrantChart.parser.js').then((m) => m.parser),
  radar: () => import('./generated/radar.parser.js').then((m) => m.parser),
  railroad: () => import('./generated/railroad.parser.js').then((m) => m.parser),
  sankey: () => import('./generated/sankey.parser.js').then((m) => m.parser),
  sequence: () => import('./generated/sequence.parser.js').then((m) => m.parser),
  state: () => import('./generated/state.parser.js').then((m) => m.parser),
  timeline: () => import('./generated/timeline.parser.js').then((m) => m.parser),
  treemap: () => import('./generated/treemap.parser.js').then((m) => m.parser),
  venn: () => import('./generated/venn.parser.js').then((m) => m.parser),
  wardley: () => import('./generated/wardley.parser.js').then((m) => m.parser),
  xychart: () => import('./generated/xychart.parser.js').then((m) => m.parser),
};
