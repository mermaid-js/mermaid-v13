/**
 * `@mermaid-js/language-service-codemirror` (DESIGN §4.5 "Adapters", R-LANG-2, D98): the
 * Mermaid language service in CodeMirror 6. Every runtime import is a peer
 * (`@codemirror/*`, `@lezer/*`, the service and core).
 *
 * ```ts
 * const view = new EditorView({
 *   doc,
 *   extensions: [basicSetup, await mermaid({ onCursorAst: (ids) => highlight(ids) })],
 * });
 * ```
 *
 * `mermaid()` waits for `service.preload()` (D155), then gives the Lezer highlighter of the
 * detected diagram type (each type's parser loaded on first use, D134), built from its
 * grammar file (#21), diagnostics (debounced 150 ms), completion, hover, folding,
 * semantic-token decorations and the cursor → AstId facet. Each is exported on its own too;
 * all but `mermaidLanguage` need `await mermaidService()` in the same state, and
 * `mermaidCompletion` also needs `mermaidLanguage()`: it is that language's completion source.
 */
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import {
  mermaidCompletion,
  mermaidCursorAst,
  mermaidDiagnostics,
  mermaidFolding,
  mermaidHover,
  mermaidSemanticTokens,
} from './features.ts';
import type { CursorAstListener } from './features.ts';
import { mermaidLanguage } from './language.ts';
import { mermaidService } from './service.ts';
import type { MermaidServiceOptions } from './service.ts';

export {
  DIAGNOSTICS_DELAY,
  completionSource,
  cursorAst,
  cursorAstListener,
  foldAt,
  hoverAt,
  lintDiagnostics,
  mermaidCompletion,
  mermaidCursorAst,
  mermaidDiagnostics,
  mermaidFolding,
  mermaidHover,
  mermaidSemanticTokens,
  selectAst,
  semanticTokenRanges,
} from './features.ts';
export type { CursorAstListener, DiagnosticsOptions, SemanticTokenRange } from './features.ts';
export {
  LEZER_HIGHLIGHTERS,
  loadHighlighter,
  mermaidLanguage,
  mermaidLanguageDefinition,
} from './language.ts';
export { renderMarkdown } from './markdown.ts';
export { mermaidService, mermaidSnapshot } from './service.ts';
export type { MermaidServiceOptions } from './service.ts';

export interface MermaidOptions extends MermaidServiceOptions {
  /** Diagnostics and semantic-token debounce in milliseconds (150 by default, D98). */
  readonly delay?: number;
  /** Called with the AST ids under the cursor whenever they change. */
  readonly onCursorAst?: CursorAstListener;
}

/** The whole language in one extension (D98), once the service's facets are loaded (D155). */
export async function mermaid(options: MermaidOptions = {}): Promise<Extension> {
  const timing = options.delay === undefined ? {} : { delay: options.delay };
  return [
    await mermaidService(options),
    mermaidLanguage(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    mermaidDiagnostics(timing),
    mermaidCompletion(),
    mermaidHover(),
    mermaidFolding(timing),
    mermaidSemanticTokens(timing),
    mermaidCursorAst(options.onCursorAst, timing),
  ];
}
