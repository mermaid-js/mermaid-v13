/**
 * One Monaco provider per service feature (D98). Each takes the service (and the `monaco`
 * namespace where it needs Monaco's enums) and answers from the model's snapshot; register
 * them yourself to pick features one by one, or call `registerMermaid` for all of them.
 */
import {
  COMPLETION_TRIGGERS,
  encodeSemanticTokens,
  SEMANTIC_TOKEN_LEGEND,
} from '@mermaid-js/language-service';
import type { CompletionKind, LanguageService } from '@mermaid-js/language-service';
import type * as Monaco from 'monaco-editor';
import { at, snapshotOf, toRange } from './convert.ts';

type Languages = typeof Monaco.languages;

/** Service completion kinds → Monaco's `CompletionItemKind` names. */
const COMPLETION_KINDS: Record<CompletionKind, keyof typeof Monaco.languages.CompletionItemKind> = {
  property: 'Property',
  value: 'Value',
  keyword: 'Keyword',
  node: 'Variable',
  subgraph: 'Module',
  class: 'Class',
  constant: 'Constant',
  operator: 'Operator',
  shape: 'Struct',
};

export function completionProvider(
  monaco: { languages: Pick<Languages, 'CompletionItemKind'> },
  service: LanguageService
): Monaco.languages.CompletionItemProvider {
  return {
    // The service's list, shared with the LSP server and CodeMirror.
    triggerCharacters: [...COMPLETION_TRIGGERS],
    provideCompletionItems(model, position) {
      const { doc, offset } = at(service, model, position);
      const suggestions = doc.completions(offset).map((item, i) => ({
        label: item.label,
        kind: monaco.languages.CompletionItemKind[COMPLETION_KINDS[item.kind]],
        insertText: item.insertText,
        range: toRange(model, item.range),
        // Keep the service's order (it ranks by context).
        sortText: String(i).padStart(5, '0'),
        ...(item.detail === undefined ? {} : { detail: item.detail }),
        ...(item.documentation === undefined
          ? {}
          : { documentation: { value: item.documentation } }),
      }));
      return { suggestions };
    },
  };
}

export function hoverProvider(service: LanguageService): Monaco.languages.HoverProvider {
  return {
    provideHover(model, position) {
      const { doc, offset } = at(service, model, position);
      const h = doc.hover(offset);
      return h && { range: toRange(model, h.range), contents: [{ value: h.contents }] };
    },
  };
}

export function definitionProvider(service: LanguageService): Monaco.languages.DefinitionProvider {
  return {
    provideDefinition(model, position) {
      const { doc, offset } = at(service, model, position);
      const r = doc.definition(offset);
      return r ? [{ uri: model.uri, range: toRange(model, r) }] : [];
    },
  };
}

export function referenceProvider(service: LanguageService): Monaco.languages.ReferenceProvider {
  return {
    provideReferences(model, position, context) {
      const { doc, offset } = at(service, model, position);
      return doc
        .references(offset, context.includeDeclaration)
        .map((r) => ({ uri: model.uri, range: toRange(model, r) }));
    },
  };
}

/** A rejection where Monaco's type also wants a location: the empty range at `position`. */
const rejection = (position: Monaco.IPosition, reason: string) => ({
  range: {
    startLineNumber: position.lineNumber,
    startColumn: position.column,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  },
  text: '',
  edits: [],
  rejectReason: reason,
});

export function renameProvider(service: LanguageService): Monaco.languages.RenameProvider {
  return {
    resolveRenameLocation(model, position) {
      const { doc, offset } = at(service, model, position);
      const r = doc.prepareRename(offset);
      if ('refused' in r) return rejection(position, r.refused);
      return { range: toRange(model, r.range), text: r.placeholder };
    },
    provideRenameEdits(model, position, newName) {
      const { doc, offset } = at(service, model, position);
      const r = doc.rename(offset, newName);
      if ('refused' in r) return rejection(position, r.refused);
      const versionId = model.getVersionId();
      return {
        edits: r.edits.map((e) => ({
          resource: model.uri,
          versionId,
          textEdit: { range: toRange(model, e.range), text: e.newText },
        })),
      };
    },
  };
}

export function foldingRangeProvider(
  service: LanguageService
): Monaco.languages.FoldingRangeProvider {
  return {
    provideFoldingRanges(model) {
      // The service's line folds (closing `end`/`---` line visible), 1-based.
      return snapshotOf(service, model)
        .lineFoldingRanges()
        .map((f) => ({ start: f.startLine + 1, end: f.endLine + 1 }));
    },
  };
}

/** The legend Monaco reads token type and modifier indexes from. */
export const SEMANTIC_TOKENS_LEGEND: Monaco.languages.SemanticTokensLegend = {
  tokenTypes: [...SEMANTIC_TOKEN_LEGEND.types],
  tokenModifiers: [...SEMANTIC_TOKEN_LEGEND.modifiers],
};

export function semanticTokensProvider(
  service: LanguageService
): Monaco.languages.DocumentSemanticTokensProvider {
  return {
    getLegend: () => SEMANTIC_TOKENS_LEGEND,
    provideDocumentSemanticTokens(model) {
      // The service's per-line tokens (Monaco has no multi-line tokens), delta-coded.
      const tokens = snapshotOf(service, model).lineSemanticTokens();
      return { data: Uint32Array.from(encodeSemanticTokens(tokens)) };
    },
    releaseDocumentSemanticTokens() {
      // Nothing is kept per result: each request encodes the snapshot's tokens afresh.
    },
  };
}
