/**
 * The info model (#420): what the parser produces and the renderer reads. Plain, frozen data
 * (R-ARCH-7). v12's info DB held only the version; the statements v12 parsed and then ignored
 * are kept here for the SVG's title and description (D133) and the language service.
 */
import type { Diagnostic } from '@mermaid-js/core/parser-kit';

export interface InfoModel {
  /** `info showInfo`. Accepted, and draws nothing extra, as in v12 (#420 Q3). */
  readonly showInfo: boolean;
  /**
   * The in-text `title` if non-empty, else the front-matter `title`; absent when neither. v12
   * drew it nowhere, and neither does v13 (D218).
   */
  readonly title?: string;
  readonly accTitle: string;
  readonly accDescr: string;
  /** Warning diagnostics of the parse (also in `ParseResult.diagnostics`). */
  readonly warnings: readonly Diagnostic[];
}
