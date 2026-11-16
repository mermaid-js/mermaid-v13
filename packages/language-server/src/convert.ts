/**
 * Service results → LSP types (D98). The service speaks UTF-16 offsets, which is LSP's
 * default (and only mandatory) position encoding, so a `LineIndex` line/column pair is an LSP
 * position as it is.
 */
import type {
  CompletionItem as ServiceCompletionItem,
  CompletionKind,
  Diagnostic as ServiceDiagnostic,
  DocumentSnapshot,
  DocumentSymbol as ServiceDocumentSymbol,
  LineFoldingRange,
  LineIndex,
  Range as ServiceRange,
} from '@mermaid-js/language-service';
import {
  diagnosticMessage,
  encodeSemanticTokens,
  inlineMarkdown,
  lineSemanticTokens,
} from '@mermaid-js/language-service';
import type {
  CompletionItem,
  Diagnostic,
  DocumentHighlight,
  DocumentSymbol,
  FoldingRange,
  MarkupContent,
  Position,
  Range,
  SelectionRange,
  SymbolInformation,
} from 'vscode-languageserver';
import { DocumentHighlightKind, SymbolKind } from 'vscode-languageserver';

/**
 * Offsets ↔ line/column of a document: its `LineIndex`, or one shifted by the start of a
 * Mermaid fence in a Markdown document (`shifted`, D581), so a fence's offsets come out as
 * Markdown positions.
 */
export type Positions = Pick<LineIndex, 'position' | 'offset'>;

/** `index` read from offset `start` on: offset 0 is the position of `start`. */
export function shifted(index: LineIndex, start: number): Positions {
  if (start === 0) return index;
  return {
    position: (offset) => index.position(offset + start),
    offset: (line, column) => index.offset(line, column) - start,
  };
}

export function toPosition(index: Positions, offset: number): Position {
  const { line, column } = index.position(offset);
  return { line, character: column };
}

export function toRange(index: Positions, range: ServiceRange): Range {
  return { start: toPosition(index, range.start), end: toPosition(index, range.end) };
}

export function toOffset(index: Positions, position: Position): number {
  return index.offset(position.line, position.character);
}

const SEVERITY = { error: 1, warning: 2, info: 3 } as const;

export function toDiagnostic(index: Positions, uri: string, d: ServiceDiagnostic): Diagnostic {
  const out: Diagnostic = {
    range: toRange(index, d.range),
    severity: SEVERITY[d.severity],
    code: d.code,
    source: 'mermaid',
    message: diagnosticMessage(d),
  };
  if (d.related?.length)
    out.relatedInformation = d.related.map((r) => ({
      location: { uri, range: toRange(index, r.range) },
      message: r.message,
    }));
  return out;
}

/** LSP `CompletionItemKind` of each service kind. */
const COMPLETION_KIND: Readonly<Record<CompletionKind, CompletionItem['kind']>> = {
  property: 10,
  value: 12,
  keyword: 14,
  node: 6, // Variable
  subgraph: 9, // Module
  class: 7,
  constant: 21,
  operator: 24,
  shape: 20, // EnumMember
};

/**
 * The service's markdown as LSP markup content: as it is when the client takes markdown, else
 * as plain text with the bold marks and code fences taken out (backticks inside a code span,
 * such as one in a label, stay).
 */
export function toMarkup(value: string, markdown: boolean): MarkupContent {
  if (markdown) return { kind: 'markdown', value };
  return {
    kind: 'plaintext',
    value: inlineMarkdown(value)
      .map((p) => p.text)
      .join(''),
  };
}

/** Whether a client capability's format list (preferred first) lets the server send markdown. */
export const takesMarkdown = (formats: readonly string[] | undefined): boolean =>
  formats === undefined || formats.includes('markdown');

/**
 * The service's completion list as LSP items. Each item's `sortText` is its place in the list,
 * zero-padded, so a client that sorts by `sortText` (every LSP client; by `label` without it)
 * keeps the service's order, as the Monaco adapter does. No `filterText` or `preselect`.
 */
export function toCompletionItems(
  index: Positions,
  items: readonly ServiceCompletionItem[],
  markdown = true
): CompletionItem[] {
  const width = Math.max(5, String(items.length).length);
  return items.map((item, i) => {
    const out: CompletionItem = {
      label: item.label,
      kind: COMPLETION_KIND[item.kind],
      sortText: String(i).padStart(width, '0'),
      textEdit: { range: toRange(index, item.range), newText: item.insertText },
    };
    if (item.detail !== undefined) out.detail = item.detail;
    if (item.documentation !== undefined)
      out.documentation = toMarkup(item.documentation, markdown);
    return out;
  });
}

/**
 * The occurrences of the name under the cursor (`references` with the declaration) as LSP
 * highlights: the definition a write, the others text.
 */
export function toHighlights(
  index: Positions,
  references: readonly ServiceRange[],
  definition: ServiceRange | undefined
): DocumentHighlight[] {
  return references.map((r) => ({
    range: toRange(index, r),
    kind:
      r.start === definition?.start && r.end === definition.end
        ? DocumentHighlightKind.Write
        : DocumentHighlightKind.Text,
  }));
}

/** A selection chain (innermost first) as the linked LSP selection range. */
export function toSelectionRange(index: Positions, chain: readonly ServiceRange[]): SelectionRange {
  let out: SelectionRange | undefined;
  for (let i = chain.length - 1; i >= 0; i--) {
    const range = toRange(index, chain[i]!);
    out = out ? { range, parent: out } : { range };
  }
  return out ?? { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } };
}

/**
 * LSP `SymbolKind` of an outline symbol, read from the outline's structure alone, so no
 * diagram's kind names live here (R-LANG-8): a symbol that opens a block (a subgraph, a
 * composite state, a namespace) is a namespace, any other a variable, as completion shows a
 * node id.
 */
const symbolKind = (s: ServiceDocumentSymbol): SymbolKind =>
  s.block ? SymbolKind.Namespace : SymbolKind.Variable;

/** The service's outline as LSP document symbols, nested. */
export function toDocumentSymbols(
  index: Positions,
  symbols: readonly ServiceDocumentSymbol[]
): DocumentSymbol[] {
  return symbols.map((s) => ({
    name: s.name,
    kind: symbolKind(s),
    range: toRange(index, s.range),
    selectionRange: toRange(index, s.nameRange),
    children: toDocumentSymbols(index, s.children),
  }));
}

/**
 * The outline flat, for a client without `hierarchicalDocumentSymbolSupport`: each symbol
 * with its statement's range and the name of the symbol it is nested in.
 */
export function toSymbolInformation(
  index: Positions,
  uri: string,
  symbols: readonly ServiceDocumentSymbol[],
  container?: string
): SymbolInformation[] {
  return symbols.flatMap((s) => {
    const info: SymbolInformation = {
      name: s.name,
      kind: symbolKind(s),
      location: { uri, range: toRange(index, s.range) },
    };
    if (container !== undefined) info.containerName = container;
    return [info, ...toSymbolInformation(index, uri, s.children, s.name)];
  });
}

/** A service fold by line as an LSP folding range, `line` lines down (a fence's first line). */
export function toFoldingRange(fold: LineFoldingRange, line = 0): FoldingRange {
  const startLine = fold.startLine + line;
  const endLine = fold.endLine + line;
  return fold.kind === 'comment' ? { startLine, endLine, kind: 'comment' } : { startLine, endLine };
}

/** A snapshot whose tokens start `line` lines down: a whole document at 0, or a fence body. */
export interface TokenSource {
  readonly doc: DocumentSnapshot;
  readonly line: number;
}

/**
 * `semanticTokens/full` data: each snapshot's per-line tokens, or the whole multi-line tokens
 * when the client has `multilineTokenSupport`, moved down to its first line. The sources come
 * in document order and do not overlap.
 */
export function semanticTokenData(sources: readonly TokenSource[], multiline: boolean): number[] {
  const tokens = sources.flatMap(({ doc, line }) => {
    const own = multiline
      ? lineSemanticTokens(doc.text, doc.semanticTokens(), { index: doc.lines(), multiline })
      : doc.lineSemanticTokens();
    return line === 0 ? own : own.map((t) => ({ ...t, line: t.line + line }));
  });
  return encodeSemanticTokens(tokens);
}
