/**
 * One Monaco provider per service feature (D98). Each takes the service (and the `monaco`
 * namespace where it needs Monaco's enums) and answers from the model's snapshot; register
 * them yourself to pick features one by one, or call `registerMermaid` for all of them.
 */
import { SEMANTIC_TOKEN_LEGEND } from '@mermaid-js/language-service';
import type { CompletionKind, LanguageService } from '@mermaid-js/language-service';
import type * as Monaco from 'monaco-editor';
import { at, snapshotOf, toRange } from './convert.ts';
import type { TextModel } from './convert.ts';

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

/** Characters after which Monaco asks for completions without a typed word. */
export const COMPLETION_TRIGGERS = [':', '-', '=', '.', '&', '@', '{', ','];

export function completionProvider(
  monaco: { languages: Pick<Languages, 'CompletionItemKind'> },
  service: LanguageService
): Monaco.languages.CompletionItemProvider {
  return {
    triggerCharacters: COMPLETION_TRIGGERS,
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
      return snapshotOf(service, model)
        .foldingRanges()
        .map(({ range }) => ({
          start: model.getPositionAt(range.start).lineNumber,
          end: model.getPositionAt(range.end).lineNumber,
        }));
    },
  };
}

/** The legend Monaco reads token type and modifier indexes from. */
export const SEMANTIC_TOKENS_LEGEND: Monaco.languages.SemanticTokensLegend = {
  tokenTypes: [...SEMANTIC_TOKEN_LEGEND.types],
  tokenModifiers: [...SEMANTIC_TOKEN_LEGEND.modifiers],
};

/**
 * Encodes tokens as Monaco (and LSP) do: five numbers per token, line and start relative to
 * the previous token. Monaco has no multi-line tokens, so a token that spans lines (a
 * multi-line label, an `accDescr { }` body, a `@{ }` block) becomes one token per line,
 * leaving out empty pieces (a token that ends at a line start).
 */
function encodeSemanticTokens(
  model: TextModel,
  tokens: ReturnType<ReturnType<LanguageService['update']>['semanticTokens']>
): Uint32Array {
  const data: number[] = [];
  let prevLine = 0;
  let prevChar = 0;
  const push = (line: number, char: number, length: number, type: number, mods: number) => {
    if (length <= 0) return;
    data.push(line - prevLine, line === prevLine ? char - prevChar : char, length, type, mods);
    prevLine = line;
    prevChar = char;
  };
  const types: readonly string[] = SEMANTIC_TOKEN_LEGEND.types;
  const modifiers: readonly string[] = SEMANTIC_TOKEN_LEGEND.modifiers;
  for (const t of tokens) {
    const type = types.indexOf(t.type);
    const mods = t.modifiers.reduce((m, x) => m | (1 << modifiers.indexOf(x)), 0);
    const start = model.getPositionAt(t.range.start);
    const end = model.getPositionAt(t.range.end);
    // 0-based lines and characters, as the encoding counts them.
    for (let line = start.lineNumber; line <= end.lineNumber; line++) {
      const from = line === start.lineNumber ? start.column : 1;
      const to = line === end.lineNumber ? end.column : model.getLineMaxColumn(line);
      push(line - 1, from - 1, to - from, type, mods);
    }
  }
  return Uint32Array.from(data);
}

export function semanticTokensProvider(
  service: LanguageService
): Monaco.languages.DocumentSemanticTokensProvider {
  return {
    getLegend: () => SEMANTIC_TOKENS_LEGEND,
    provideDocumentSemanticTokens(model) {
      return { data: encodeSemanticTokens(model, snapshotOf(service, model).semanticTokens()) };
    },
    releaseDocumentSemanticTokens() {
      // Nothing is kept per result: each request encodes the snapshot's tokens afresh.
    },
  };
}
