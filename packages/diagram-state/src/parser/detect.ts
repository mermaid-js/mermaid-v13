/**
 * State detection, as v12's one state detector (`stateDetector-V2`, `/^\s*stateDiagram/`) saw
 * the text: after the front matter, with directives and `%%` comments removed. Both
 * `stateDiagram` and `stateDiagram-v2` go to the one diagram (D101).
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';

export function detectState(src: string): boolean {
  return src.startsWith('stateDiagram', diagramStart(src, preprocess(src)));
}
