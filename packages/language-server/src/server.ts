/**
 * The Mermaid language server (R-LANG-2, D98): a thin LSP wrapper over
 * `@mermaid-js/language-service` for `.mmd` and `.mermaid` documents. Full-text sync; each
 * change re-parses (`service.update`) and pushes the diagnostics. Facets load during
 * `initialize` (D155): the server answers it only after `service.preload()`, so no snapshot
 * is ever made before its facet is there.
 */
import { fileURLToPath } from 'node:url';
import type { DocumentSnapshot, FacetEntry, LanguageService } from '@mermaid-js/language-service';
import {
  createLanguageService,
  LineIndex,
  SEMANTIC_TOKEN_LEGEND,
} from '@mermaid-js/language-service';
import type {
  Connection,
  InitializeParams,
  InitializeResult,
  Position,
  TextDocumentIdentifier,
} from 'vscode-languageserver';
import { LSPErrorCodes, ResponseError, TextDocumentSyncKind } from 'vscode-languageserver';
import {
  encodeSemanticTokens,
  toCompletionItem,
  toDiagnostic,
  toFoldingRanges,
  toOffset,
  toRange,
} from './convert.ts';
import { discoverFacets } from './discover.ts';

/** Documents the server serves: `.mmd` and `.mermaid` (any case), by URI path. */
export function isMermaidUri(uri: string): boolean {
  const path = uri.replace(/[?#].*$/, '');
  return /\.(mmd|mermaid)$/i.test(path);
}

export interface ServerOptions {
  /**
   * Third-party facet rows. When omitted, the server scans `node_modules` from the
   * workspace root (`rootUri`, else the first workspace folder, else the process's cwd).
   */
  readonly facets?: readonly FacetEntry[];
}

interface Open {
  readonly doc: DocumentSnapshot;
  readonly index: LineIndex;
}

/** The workspace root directory `initialize` names, if it is a `file:` URI. */
function rootOf(params: InitializeParams): string | undefined {
  const uri = params.rootUri ?? params.workspaceFolders?.[0]?.uri;
  if (!uri?.startsWith('file:')) return params.rootPath ?? undefined;
  try {
    return fileURLToPath(uri);
  } catch {
    return undefined;
  }
}

/** Wire the server to `connection` and start listening. */
export function startServer(connection: Connection, options: ServerOptions = {}): void {
  let service: LanguageService | undefined;
  let multiline = false;
  const open = new Map<string, Open>();

  const update = (uri: string, text: string) => {
    if (!service || !isMermaidUri(uri)) return;
    const doc = service.update(uri, text);
    const index = new LineIndex(text);
    open.set(uri, { doc, index });
    void connection.sendDiagnostics({
      uri,
      diagnostics: doc.diagnostics().map((d) => toDiagnostic(index, uri, d)),
    });
  };

  /** The open document and the offset of `position` in it. */
  const at = (
    textDocument: TextDocumentIdentifier,
    position: Position
  ): (Open & { offset: number }) | undefined => {
    const o = open.get(textDocument.uri);
    return o && { ...o, offset: toOffset(o.index, position) };
  };

  connection.onInitialize(async (params): Promise<InitializeResult> => {
    multiline = params.capabilities.textDocument?.semanticTokens?.multilineTokenSupport === true;
    const root = rootOf(params) ?? process.cwd();
    const facets =
      options.facets ??
      (await discoverFacets(root, { log: (m) => connection.console.warn(`mermaid: ${m}`) }));
    service = createLanguageService({ facets });
    await service.preload();
    return {
      serverInfo: { name: 'mermaid-language-server' },
      capabilities: {
        positionEncoding: 'utf-16',
        textDocumentSync: { openClose: true, change: TextDocumentSyncKind.Full },
        definitionProvider: true,
        referencesProvider: true,
        renameProvider: { prepareProvider: true },
        hoverProvider: true,
        foldingRangeProvider: true,
        completionProvider: {},
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

  connection.onDidOpenTextDocument(({ textDocument }) =>
    update(textDocument.uri, textDocument.text)
  );
  connection.onDidChangeTextDocument(({ textDocument, contentChanges }) => {
    // Full sync: the last change holds the whole text.
    const last = contentChanges[contentChanges.length - 1];
    if (last) update(textDocument.uri, last.text);
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
      contents: { kind: 'markdown', value: hover.contents },
      range: toRange(o.index, hover.range),
    };
  });

  connection.onFoldingRanges(({ textDocument }) => {
    const o = open.get(textDocument.uri);
    return o ? toFoldingRanges(o.index, o.doc.foldingRanges()) : null;
  });

  connection.languages.semanticTokens.on(({ textDocument }) => {
    const o = open.get(textDocument.uri);
    const data = o
      ? encodeSemanticTokens(o.index, o.doc.text, o.doc.semanticTokens(), multiline)
      : [];
    return { data };
  });

  connection.onCompletion(({ textDocument, position }) => {
    const o = at(textDocument, position);
    if (!o) return null;
    return o.doc.completions(o.offset).map((item) => toCompletionItem(o.index, item));
  });

  connection.listen();
}
