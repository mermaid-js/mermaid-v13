/**
 * The Mermaid language server (R-LANG-2, D98): a thin LSP wrapper over
 * `@mermaid-js/language-service` for `.mmd` and `.mermaid` documents, and any document opened
 * with language id `mermaid` (an untitled buffer). Incremental sync is advertised: ranged
 * changes are applied in order, a change without a range replaces the text, and a change older
 * than the stored version is ignored. Each change re-parses (`service.update`) and pushes the
 * diagnostics with the version of the text they were made from; the push on close has none.
 *
 * Facets load during `initialize` (D155): the server answers it only after
 * `service.preload()`, so no snapshot is ever made before its facet is there. Third-party
 * facets are found only when the client opts in with `initializationOptions.mermaid.plugins`
 * (D157), with the render scan (D577), in the workspace folders `initialize` names and never
 * in the working directory (D578); by default the server runs no code from the opened folder.
 * A document opened later also has its package root scanned, once, when that root lies inside
 * a workspace folder; new facets rebuild the service and re-publish the open documents (D579).
 */
import { fileURLToPath } from 'node:url';
import type { DocumentSnapshot, FacetEntry, LanguageService } from '@mermaid-js/language-service';
import {
  COMPLETION_TRIGGERS,
  createLanguageService,
  LineIndex,
  SEMANTIC_TOKEN_LEGEND,
} from '@mermaid-js/language-service';
import type {
  Connection,
  InitializeParams,
  InitializeResult,
  Position,
  TextDocumentContentChangeEvent,
  TextDocumentIdentifier,
} from 'vscode-languageserver';
import { LSPErrorCodes, ResponseError, TextDocumentSyncKind } from 'vscode-languageserver';
import {
  semanticTokenData,
  takesMarkdown,
  toCompletionItems,
  toDiagnostic,
  toDocumentSymbols,
  toFoldingRange,
  toHighlights,
  toMarkup,
  toOffset,
  toRange,
  toSelectionRange,
  toSymbolInformation,
} from './convert.ts';
import { pluginRoots, type PluginRoots } from './roots.ts';
import { selectionChain } from './selection.ts';
import { VERSION } from './version.ts';

/** Documents the server serves by URI: `.mmd` and `.mermaid` (any case). */
export function isMermaidUri(uri: string): boolean {
  const path = uri.replace(/[?#].*$/, '');
  return /\.(mmd|mermaid)$/i.test(path);
}

export interface ServerOptions {
  /**
   * Third-party facet rows. When given, no `node_modules` scan happens whatever the client
   * asks. When omitted, the server scans only if the client opts in (D157).
   */
  readonly facets?: readonly FacetEntry[];
}

/** The client's opt-in to third-party facets (D157): `{ mermaid: { plugins: true } }`. */
export function pluginsEnabled(initializationOptions: unknown): boolean {
  const mermaid = (initializationOptions as { mermaid?: unknown } | null | undefined)?.mermaid;
  return (mermaid as { plugins?: unknown } | null | undefined)?.plugins === true;
}

interface Open {
  readonly text: string;
  readonly version: number;
  readonly index: LineIndex;
  readonly doc: DocumentSnapshot;
}

const fileDir = (uri: string): string | undefined => {
  if (!uri.startsWith('file:')) return undefined;
  try {
    return fileURLToPath(uri);
  } catch {
    return undefined;
  }
};

/** Every workspace folder `initialize` names (each `file:` folder, else `rootUri`/`rootPath`). */
function rootsOf(params: InitializeParams): string[] {
  const folders = (params.workspaceFolders ?? []).map((f) => fileDir(f.uri));
  const roots = folders.filter((d) => d !== undefined);
  if (roots.length > 0) return roots;
  const root = params.rootUri ? fileDir(params.rootUri) : (params.rootPath ?? undefined);
  return root ? [root] : [];
}

/** `text` with the change applied: a ranged change splices, a full one replaces. */
function applyChange(text: string, change: TextDocumentContentChangeEvent): string {
  if (!('range' in change)) return change.text;
  const index = new LineIndex(text);
  const start = toOffset(index, change.range.start);
  const end = Math.max(start, toOffset(index, change.range.end));
  return text.slice(0, start) + change.text + text.slice(end);
}

/**
 * Highlights, selection ranges and the outline (#810) of the open documents (`get`); `nested`
 * tells whether the client takes hierarchical document symbols.
 */
function serveStructure(
  connection: Connection,
  get: (uri: string) => Open | undefined,
  nested: () => boolean
): void {
  connection.onDocumentHighlight(({ textDocument, position }) => {
    const o = get(textDocument.uri);
    if (!o) return null;
    const offset = toOffset(o.index, position);
    return toHighlights(o.index, o.doc.references(offset), o.doc.definition(offset));
  });

  connection.onSelectionRanges(({ textDocument, positions }) => {
    const o = get(textDocument.uri);
    if (!o) return null;
    return positions.map((p) =>
      toSelectionRange(o.index, selectionChain(o.doc, toOffset(o.index, p)))
    );
  });

  connection.onDocumentSymbol(({ textDocument }) => {
    const o = get(textDocument.uri);
    if (!o) return null;
    const symbols = o.doc.symbols();
    return nested()
      ? toDocumentSymbols(o.index, symbols)
      : toSymbolInformation(o.index, textDocument.uri, symbols);
  });
}

interface StartFacets {
  readonly facets: readonly FacetEntry[];
  /** Where to scan for more as documents open; set when the client opts in (D579). */
  readonly plugins?: PluginRoots;
}

/**
 * The facets the service starts with: the embedder's rows, else, when the client opts in
 * (D157), the plugins of the workspace folders it names (D578).
 */
async function startFacets(
  connection: Connection,
  options: ServerOptions,
  params: InitializeParams
): Promise<StartFacets> {
  if (options.facets !== undefined) return { facets: options.facets };
  if (!pluginsEnabled(params.initializationOptions)) return { facets: [] };
  const folders = rootsOf(params);
  // No folder: the working directory is not one the user chose to trust (D578).
  if (folders.length === 0) {
    connection.console.warn(
      'mermaid: plugins are on, but the client named no workspace folder: no plugins discovered'
    );
    return { facets: [] };
  }
  const plugins = pluginRoots(folders, { log: (m) => connection.console.warn(`mermaid: ${m}`) });
  return { facets: await plugins.folders(), plugins };
}

/**
 * A service with `facets`, every facet loaded (D155), so no snapshot is made before its facet
 * is there.
 */
async function preloaded(facets: readonly FacetEntry[]): Promise<LanguageService> {
  const service = createLanguageService({ facets });
  await service.preload();
  return service;
}

/** Wire the server to `connection` and start listening. */
export function startServer(connection: Connection, options: ServerOptions = {}): void {
  let service: LanguageService | undefined;
  let multiline = false;
  let hoverMarkdown = true;
  let docMarkdown = true;
  let nestedSymbols = false;
  const open = new Map<string, Open>();
  let { facets, plugins }: StartFacets = { facets: [] };
  let rebuilt: Promise<void> = Promise.resolve();

  const update = (uri: string, text: string, version: number) => {
    if (!service) return;
    const index = new LineIndex(text);
    // A facet whose parse throws gives a LANGUAGE_FACET_FAILED snapshot (the service guards it).
    const doc = service.update(uri, text);
    open.set(uri, { text, version, index, doc });
    void connection.sendDiagnostics({
      uri,
      version,
      diagnostics: doc.diagnostics().map((d) => toDiagnostic(index, uri, d)),
    });
  };

  /**
   * Rebuild the service with `rows` added, if any, and re-publish every open document's
   * diagnostics (D579). Rebuilds run one at a time; a change that arrives meanwhile goes to
   * the old service and is parsed again by the new one.
   */
  const addFacets = (rows: readonly FacetEntry[]): void => {
    if (rows.length === 0) return;
    rebuilt = rebuilt.then(async () => {
      facets = [...facets, ...rows];
      service = await preloaded(facets);
      for (const [uri, o] of open) update(uri, o.text, o.version);
    });
  };

  /** The open document's snapshot and the offset of `position` in it. */
  const at = (
    textDocument: TextDocumentIdentifier,
    position: Position
  ): { doc: DocumentSnapshot; index: LineIndex; offset: number } | undefined => {
    const o = open.get(textDocument.uri);
    return o && { doc: o.doc, index: o.index, offset: toOffset(o.index, position) };
  };

  connection.onInitialize(async (params): Promise<InitializeResult> => {
    const text = params.capabilities.textDocument;
    multiline = text?.semanticTokens?.multilineTokenSupport === true;
    hoverMarkdown = takesMarkdown(text?.hover?.contentFormat);
    docMarkdown = takesMarkdown(text?.completion?.completionItem?.documentationFormat);
    nestedSymbols = text?.documentSymbol?.hierarchicalDocumentSymbolSupport === true;
    ({ facets, plugins } = await startFacets(connection, options, params));
    service = await preloaded(facets);
    return {
      serverInfo: { name: 'mermaid-language-server', version: VERSION },
      capabilities: {
        positionEncoding: 'utf-16',
        textDocumentSync: { openClose: true, change: TextDocumentSyncKind.Incremental },
        definitionProvider: true,
        referencesProvider: true,
        renameProvider: { prepareProvider: true },
        hoverProvider: true,
        foldingRangeProvider: true,
        documentHighlightProvider: true,
        selectionRangeProvider: true,
        documentSymbolProvider: true,
        completionProvider: { triggerCharacters: [...COMPLETION_TRIGGERS] },
        semanticTokensProvider: {
          legend: {
            tokenTypes: [...SEMANTIC_TOKEN_LEGEND.types],
            tokenModifiers: [...SEMANTIC_TOKEN_LEGEND.modifiers],
          },
          full: true,
        },
      },
    };
  });

  connection.onDidOpenTextDocument(({ textDocument: { uri, languageId, version, text } }) => {
    if (!isMermaidUri(uri) && languageId !== 'mermaid') return;
    update(uri, text, version);
    const file = fileDir(uri);
    if (plugins && file !== undefined) void plugins.document(file).then(addFacets);
  });
  connection.onDidChangeTextDocument(({ textDocument: { uri, version }, contentChanges }) => {
    const o = open.get(uri);
    if (!o) return;
    if (version <= o.version) {
      connection.console.warn(`mermaid: ignored version ${version} of ${uri} (have ${o.version})`);
      return;
    }
    update(uri, contentChanges.reduce(applyChange, o.text), version);
  });
  connection.onDidCloseTextDocument(({ textDocument: { uri } }) => {
    if (!open.delete(uri)) return;
    service?.close(uri);
    void connection.sendDiagnostics({ uri, diagnostics: [] });
  });

  connection.onDefinition(({ textDocument, position }) => {
    const o = at(textDocument, position);
    const range = o?.doc.definition(o.offset);
    return o && range ? { uri: textDocument.uri, range: toRange(o.index, range) } : null;
  });

  connection.onReferences(({ textDocument, position, context }) => {
    const o = at(textDocument, position);
    if (!o) return null;
    return o.doc
      .references(o.offset, context.includeDeclaration)
      .map((r) => ({ uri: textDocument.uri, range: toRange(o.index, r) }));
  });

  connection.onPrepareRename(({ textDocument, position }) => {
    const o = at(textDocument, position);
    if (!o) return null;
    const result = o.doc.prepareRename(o.offset);
    if ('refused' in result) return new ResponseError(LSPErrorCodes.RequestFailed, result.refused);
    return { range: toRange(o.index, result.range), placeholder: result.placeholder };
  });

  connection.onRenameRequest(({ textDocument, position, newName }) => {
    const o = at(textDocument, position);
    if (!o) return null;
    const result = o.doc.rename(o.offset, newName);
    if ('refused' in result) return new ResponseError(LSPErrorCodes.RequestFailed, result.refused);
    return {
      changes: {
        [textDocument.uri]: result.edits.map((e) => ({
          range: toRange(o.index, e.range),
          newText: e.newText,
        })),
      },
    };
  });

  connection.onHover(({ textDocument, position }) => {
    const o = at(textDocument, position);
    const hover = o?.doc.hover(o.offset);
    if (!o || !hover) return null;
    return {
      contents: toMarkup(hover.contents, hoverMarkdown),
      range: toRange(o.index, hover.range),
    };
  });

  serveStructure(
    connection,
    (uri) => open.get(uri),
    () => nestedSymbols
  );

  connection.onFoldingRanges(({ textDocument }) => {
    const o = open.get(textDocument.uri);
    return o ? o.doc.lineFoldingRanges().map(toFoldingRange) : null;
  });

  connection.languages.semanticTokens.on(({ textDocument }) => {
    const o = open.get(textDocument.uri);
    return { data: o ? semanticTokenData(o.doc, multiline) : [] };
  });

  connection.onCompletion(({ textDocument, position }) => {
    const o = at(textDocument, position);
    if (!o) return null;
    return toCompletionItems(o.index, o.doc.completions(o.offset), docMarkdown);
  });

  connection.listen();
}
