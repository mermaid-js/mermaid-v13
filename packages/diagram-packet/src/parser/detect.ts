// cspell:words packetx
/**
 * Packet detection, as v12's detector saw the text (`/^\s*packet(-beta)?/`, case-sensitive):
 * after the front matter, with directives and `%%` comments removed. `packetx` is detected too,
 * and then rejected by the parser, as in v12.
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

export function detectPacket(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  return src.startsWith('packet', diagramStart(src, pre));
}
