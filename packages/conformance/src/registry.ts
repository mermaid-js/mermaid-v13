import { classAdapter } from './class/v13.ts';
import type { ParitySuite } from './corpus.ts';
import { erAdapter } from './er/v13.ts';
import { flowchartAdapter } from './flowchart/v13.ts';
import { infoAdapter } from './info/v13.ts';
import { ganttAdapter } from './gantt/v13.ts';
import { gitGraphAdapter } from './gitgraph/v13.ts';
import { journeyAdapter } from './journey/v13.ts';
import { mindmapParityCorpus } from './mindmap/corpus.ts';
import { mindmapAdapter } from './mindmap/v13.ts';
import { pieAdapter } from './pie/v13.ts';
import { quadrantParityCorpus } from './quadrant/corpus.ts';
import { quadrantAdapter } from './quadrant/v13.ts';
import { sequenceAdapter } from './sequence/v13.ts';
import { stateAdapter } from './state/v13.ts';
import { timelineAdapter } from './timeline/v13.ts';

/**
 * The diagrams under oracle parity. Each first-party diagram ticket adds its suite here, e.g.
 * `{ adapter: flowchartAdapter, corpusDirs: ['e2e/diagrams/flowchart'] }` (ticket #8).
 */
export const PARITY_SUITES: ParitySuite[] = [
  {
    adapter: flowchartAdapter,
    corpusDirs: ['e2e/diagrams/flowchart'],
    corpusFiles: ['packages/conformance/corpus/flowchart-v12-specs.json'],
  },
  {
    adapter: sequenceAdapter,
    corpusDirs: ['e2e/diagrams/sequence'],
    corpusFiles: [
      'packages/conformance/corpus/sequence-v12-specs.json',
      'packages/conformance/corpus/sequence-cases.json',
    ],
  },
  {
    adapter: classAdapter,
    corpusDirs: ['e2e/diagrams/class-diagram'],
    corpusFiles: ['packages/conformance/corpus/class-v12-specs.json'],
  },
  {
    adapter: erAdapter,
    corpusDirs: ['e2e/diagrams/er-diagram'],
    corpusFiles: ['packages/conformance/corpus/er-v12-specs.json'],
  },
  {
    adapter: stateAdapter,
    corpusDirs: ['e2e/diagrams/state-diagram', 'e2e/diagrams/state-diagram-v2'],
    corpusFiles: ['packages/conformance/corpus/state-v12-specs.json'],
  },
  {
    adapter: journeyAdapter,
    corpusDirs: ['e2e/diagrams/journey'],
    corpusFiles: ['packages/conformance/corpus/journey-v12-specs.json'],
  },
  {
    adapter: timelineAdapter,
    corpusDirs: ['e2e/diagrams/timeline'],
    corpusFiles: [
      'packages/conformance/corpus/timeline-v12-specs.json',
      'packages/conformance/corpus/timeline-cases.json',
    ],
  },
  {
    adapter: mindmapAdapter,
    corpusDirs: ['e2e/diagrams/mindmap'],
    corpusFiles: [
      'packages/conformance/corpus/mindmap-v12-specs.json',
      'packages/conformance/corpus/mindmap-cases.json',
    ],
    corpus: mindmapParityCorpus,
  },
  {
    adapter: ganttAdapter,
    corpusDirs: ['e2e/diagrams/gantt'],
    corpusFiles: [
      'packages/conformance/corpus/gantt-v12-specs.json',
      'packages/conformance/corpus/gantt-cases.json',
    ],
  },
  {
    adapter: pieAdapter,
    corpusDirs: ['e2e/diagrams/pie'],
    corpusFiles: ['packages/conformance/corpus/pie-v12-specs.json'],
  },
  {
    adapter: gitGraphAdapter,
    corpusDirs: ['e2e/diagrams/git'],
    corpusFiles: [
      'packages/conformance/corpus/gitGraph-v12-specs.json',
      'packages/conformance/corpus/gitGraph-cases.json',
    ],
  },
  {
    adapter: infoAdapter,
    corpusDirs: ['e2e/diagrams/info'],
    corpusFiles: ['packages/conformance/corpus/info-v12-specs.json'],
  },
  {
    adapter: quadrantAdapter,
    corpusDirs: ['e2e/diagrams/quadrant-chart'],
    corpusFiles: [
      'packages/conformance/corpus/quadrant-v12-specs.json',
      'packages/conformance/corpus/quadrant-cases.json',
    ],
    corpus: quadrantParityCorpus,
  },
];

/** The committed divergence list (R-COMPAT-4). */
export const DIVERGENCES_FILE = new URL('../divergences.json', import.meta.url);
