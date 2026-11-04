/**
 * `@mermaid-js/language-service-monaco` (DESIGN §4.5 "Adapters", D98, R-LANG-2): the Mermaid
 * language service in Monaco. `monaco-editor` and the service are peers; nothing here imports
 * Monaco at run time (pass your `monaco` namespace in).
 *
 * ```ts
 * import * as monaco from 'monaco-editor';
 * const { service } = await registerMermaid(monaco); // preloads the facets first (D155)
 * monaco.editor.create(el, { language: 'mermaid', 'semanticHighlighting.enabled': true });
 * ```
 *
 * The single providers (`hoverProvider(service)`, …) are exported for hosts that pick
 * features one by one.
 */
// A generated highlighter, never shipped by the flowchart package (D54): its `./monarch.json`
// export has only the workspace `mermaid-source` condition, so this private adapter (and the
// example built from sources) can read it. Publishing the adapter needs a decision on where
// the tokenizer ships.
import monarch from '@mermaid-js/diagram-flowchart/monarch.json' with { type: 'json' };
import { createLanguageService } from '@mermaid-js/language-service';
import type { LanguageService, PreloadRequest } from '@mermaid-js/language-service';
import type * as Monaco from 'monaco-editor';
import type { MonacoApi } from './convert.ts';
import { watchDiagnostics } from './markers.ts';
import {
  completionProvider,
  definitionProvider,
  foldingRangeProvider,
  hoverProvider,
  referenceProvider,
  renameProvider,
  semanticTokensProvider,
} from './providers.ts';

export { astAtCursor, revealAst, trackAst } from './ast.ts';
export { snapshotOf, toRange } from './convert.ts';
export type { MonacoApi } from './convert.ts';
export { toMarkers, watchDiagnostics } from './markers.ts';
export {
  COMPLETION_TRIGGERS,
  completionProvider,
  definitionProvider,
  foldingRangeProvider,
  hoverProvider,
  referenceProvider,
  renameProvider,
  SEMANTIC_TOKENS_LEGEND,
  semanticTokensProvider,
} from './providers.ts';

/** The Monarch tokenizer generated from the flowchart grammar file (#21), front matter included. */
export const monarchLanguage = monarch as unknown as Monaco.languages.IMonarchLanguage;

/** Comments, brackets and auto-closing pairs. */
export const languageConfiguration: Monaco.languages.LanguageConfiguration = {
  comments: { lineComment: '%%' },
  brackets: [
    ['[', ']'],
    ['(', ')'],
    ['{', '}'],
  ],
  autoClosingPairs: [
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '{', close: '}' },
    { open: '"', close: '"', notIn: ['string'] },
  ],
  surroundingPairs: [
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '{', close: '}' },
    { open: '"', close: '"' },
  ],
};

export interface MermaidMonacoOptions {
  /** The service to use; a new `createLanguageService()` when omitted. */
  readonly service?: LanguageService;
  /** What to preload (D155); every facet when omitted. */
  readonly preload?: PreloadRequest;
  /** The Monaco language id; `mermaid` when omitted. */
  readonly languageId?: string;
  /** Milliseconds after the last edit before markers update; 150 when omitted. */
  readonly diagnosticsDelay?: number;
}

export interface MermaidRegistration extends Monaco.IDisposable {
  readonly service: LanguageService;
  readonly languageId: string;
}

/**
 * Register Mermaid in `monaco` (D98): the language id, the Monarch tokens, the language
 * configuration, markers for every model of the language, and the completion, hover,
 * definition, references, rename, folding and semantic-token providers. Awaits
 * `service.preload()` first (D155), so no snapshot is taken before the facets are loaded.
 * `dispose()` removes everything it registered (Monaco cannot unregister a language id).
 */
export async function registerMermaid(
  monaco: MonacoApi,
  options: MermaidMonacoOptions = {}
): Promise<MermaidRegistration> {
  const service = options.service ?? createLanguageService();
  const languageId = options.languageId ?? 'mermaid';
  await service.preload(options.preload);
  const { languages } = monaco;
  if (!languages.getLanguages().some((l) => l.id === languageId)) {
    languages.register({ id: languageId, extensions: ['.mmd', '.mermaid'], aliases: ['Mermaid'] });
  }
  const disposables: Monaco.IDisposable[] = [
    languages.setMonarchTokensProvider(languageId, monarchLanguage),
    languages.setLanguageConfiguration(languageId, languageConfiguration),
    languages.registerCompletionItemProvider(languageId, completionProvider(monaco, service)),
    languages.registerHoverProvider(languageId, hoverProvider(service)),
    languages.registerDefinitionProvider(languageId, definitionProvider(service)),
    languages.registerReferenceProvider(languageId, referenceProvider(service)),
    languages.registerRenameProvider(languageId, renameProvider(service)),
    languages.registerFoldingRangeProvider(languageId, foldingRangeProvider(service)),
    languages.registerDocumentSemanticTokensProvider(languageId, semanticTokensProvider(service)),
    watchDiagnostics(monaco, service, languageId, options.diagnosticsDelay),
  ];
  return {
    service,
    languageId,
    dispose() {
      for (const d of disposables.splice(0).reverse()) d.dispose();
    },
  };
}
