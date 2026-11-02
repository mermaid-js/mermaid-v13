/**
 * Flowchart detection, as v12's `flowDetector-v2` and `flowchart-elk` detectors saw the text:
 * after the front matter, with directives and `%%` comments removed.
 */
import { isSpace } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

/** v12 diagram type of a flowchart source, or undefined when it is not one. */
export type FlowchartType = 'flowchart-v2' | 'flowchart-elk';

export function detectFlowchart(
  src: string,
  pre: PreprocessResult = preprocess(src)
): FlowchartType | undefined {
  let i = pre.bodyStart;
  let d = 0;
  while (i < src.length) {
    const dir = pre.directives[d];
    if (dir && dir.range.start <= i) {
      if (dir.range.end > i) i = dir.range.end;
      d++;
      continue;
    }
    if (isSpace(src.charCodeAt(i))) i++;
    else if (src.startsWith('%%', i)) {
      while (i < src.length && src[i] !== '\n') i++;
    } else break;
  }
  if (src.startsWith('flowchart-elk', i)) return 'flowchart-elk';
  if (src.startsWith('graph', i) || src.startsWith('flowchart', i)) return 'flowchart-v2';
  return undefined;
}
