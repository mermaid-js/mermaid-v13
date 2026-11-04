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
export type { TrackAstOptions } from './ast.ts';
export { snapshotOf, toRange } from './convert.ts';
export type { MonacoApi } from './convert.ts';
export { toMarkers, watchDiagnostics } from './markers.ts';
export {
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

/** One language id's registration in one `monaco`, shared by every handle to it. */
interface Shared {
  readonly service: LanguageService;
  ready: Promise<Monaco.IDisposable[]>;
  handles: number;
}

/** Registrations per `monaco.languages` (the registry they live in), then per language id. */
const registered = new WeakMap<object, Map<string, Shared>>();

/**
 * Register Mermaid in `monaco` (D98): the language id, the Monarch tokens, the language
 * configuration, markers for every model of the language, and the completion, hover,
 * definition, references, rename, folding and semantic-token providers. Awaits
 * `service.preload()` first (D155), so no snapshot is taken before the facets are loaded.
 *
 * Once per language id: calling it again for the same `monaco` and id returns a handle to the
 * same registration (another `service` for it is refused), and the providers and markers stay
 * until every handle is disposed. Monaco cannot unregister a language id, so that stays.
 */
export async function registerMermaid(
  monaco: MonacoApi,
  options: MermaidMonacoOptions = {}
): Promise<MermaidRegistration> {
  const languageId = options.languageId ?? 'mermaid';
  const { languages } = monaco;
  let byId = registered.get(languages);
  if (!byId) registered.set(languages, (byId = new Map<string, Shared>()));
  let shared = byId.get(languageId);
  if (shared && options.service && options.service !== shared.service) {
    throw new Error(`Mermaid is already registered for "${languageId}" with another service.`);
  }
  if (!shared) {
    const service = options.service ?? createLanguageService();
    const ready = (async () => {
      await service.preload(options.preload);
      if (!languages.getLanguages().some((l) => l.id === languageId)) {
        languages.register({
          id: languageId,
          extensions: ['.mmd', '.mermaid'],
          aliases: ['Mermaid'],
        });
      }
      return [
        languages.setMonarchTokensProvider(languageId, monarchLanguage),
        languages.setLanguageConfiguration(languageId, languageConfiguration),
        languages.registerCompletionItemProvider(languageId, completionProvider(monaco, service)),
        languages.registerHoverProvider(languageId, hoverProvider(service)),
        languages.registerDefinitionProvider(languageId, definitionProvider(service)),
        languages.registerReferenceProvider(languageId, referenceProvider(service)),
        languages.registerRenameProvider(languageId, renameProvider(service)),
        languages.registerFoldingRangeProvider(languageId, foldingRangeProvider(service)),
        languages.registerDocumentSemanticTokensProvider(
          languageId,
          semanticTokensProvider(service)
        ),
        watchDiagnostics(monaco, service, languageId, options.diagnosticsDelay),
      ];
    })();
    shared = { service, ready, handles: 0 };
    byId.set(languageId, shared);
  }
  const entry = shared;
  entry.handles++;
  let disposables: Monaco.IDisposable[];
  try {
    disposables = await entry.ready;
  } catch (error) {
    if (--entry.handles === 0) byId.delete(languageId);
    throw error;
  }
  let open = true;
  return {
    service: entry.service,
    languageId,
    dispose() {
      if (!open) return;
      open = false;
      if (--entry.handles > 0) return;
      byId.delete(languageId);
      for (const d of [...disposables].reverse()) d.dispose();
    },
  };
}
