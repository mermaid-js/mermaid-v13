// cspell:words betax
/**
 * TreeView detection, as v12's detector saw the text (`/^\s*treeView-beta/`, case-sensitive, no
 * boundary): after the front matter, with directives and `%%` comments removed. So
 * `treeView-betaX` and `treeView-beta %% c` are detected, and the parser then rejects them, as
 * in v12.
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import { HEADER } from './tokens.ts';

export function detectTreeView(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  return src.startsWith(HEADER, diagramStart(src, pre));
}
