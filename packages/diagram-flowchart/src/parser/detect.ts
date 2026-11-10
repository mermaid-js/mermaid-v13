/**
 * Flowchart detection, as v12's `flowDetector-v2`, `flowchart-elk` and `swimlane` detectors saw
 * the text: after the front matter, with directives and `%%` comments removed. `swimlane-beta`
 * is flowchart's syntax with the swimlane engine as its default layout (D534).
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

/** v12 diagram type of a flowchart source, or undefined when it is not one. */
export type FlowchartType = 'flowchart-v2' | 'flowchart-elk' | 'swimlane';

export function detectFlowchart(
  src: string,
  pre: PreprocessResult = preprocess(src)
): FlowchartType | undefined {
  const start = diagramStart(src, pre);
  if (src.startsWith('flowchart-elk', start)) return 'flowchart-elk';
  if (/^swimlane-beta\b/.test(src.slice(start, start + 14))) return 'swimlane';
  if (src.startsWith('graph', start) || src.startsWith('flowchart', start)) return 'flowchart-v2';
  return undefined;
}
