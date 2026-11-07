/**
 * Diagram id → its first-paint Lezer parser (D134), built from gen-grammar's highlighting
 * grammar (`src/generated/<id>.parser.js`) and imported on demand. This table is the list:
 * `scripts/lezer.ts` builds a parser for each id in it, and the keys are the first-party facet
 * ids, so a port's new facet does not compile here until it has its row
 * (`agents/port-diagram/language.md`).
 */
import type { LRParser } from '@lezer/lr';
import type { FirstPartyFacetId } from '@mermaid-js/language-service';

export const LEZER_HIGHLIGHTERS: Readonly<Record<FirstPartyFacetId, () => Promise<LRParser>>> = {
  flowchart: () => import('./generated/flowchart.parser.js').then((m) => m.parser),
  sequence: () => import('./generated/sequence.parser.js').then((m) => m.parser),
  class: () => import('./generated/class.parser.js').then((m) => m.parser),
  state: () => import('./generated/state.parser.js').then((m) => m.parser),
  er: () => import('./generated/er.parser.js').then((m) => m.parser),
  journey: () => import('./generated/journey.parser.js').then((m) => m.parser),
  quadrantChart: () => import('./generated/quadrantChart.parser.js').then((m) => m.parser),
  timeline: () => import('./generated/timeline.parser.js').then((m) => m.parser),
  gitGraph: () => import('./generated/gitGraph.parser.js').then((m) => m.parser),
  pie: () => import('./generated/pie.parser.js').then((m) => m.parser),
  info: () => import('./generated/info.parser.js').then((m) => m.parser),
  mindmap: () => import('./generated/mindmap.parser.js').then((m) => m.parser),
  gantt: () => import('./generated/gantt.parser.js').then((m) => m.parser),
  radar: () => import('./generated/radar.parser.js').then((m) => m.parser),
};
