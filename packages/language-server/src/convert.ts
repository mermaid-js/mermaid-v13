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
  FoldingRange,
  MarkupContent,
  Position,
  Range,
} from 'vscode-languageserver';

export function toPosition(index: LineIndex, offset: number): Position {
  const { line, column } = index.position(offset);
  return { line, character: column };
}

export function toRange(index: LineIndex, range: ServiceRange): Range {
  return { start: toPosition(index, range.start), end: toPosition(index, range.end) };
}

export function toOffset(index: LineIndex, position: Position): number {
  return index.offset(position.line, position.character);
}

const SEVERITY = { error: 1, warning: 2, info: 3 } as const;

export function toDiagnostic(index: LineIndex, uri: string, d: ServiceDiagnostic): Diagnostic {
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

export function toCompletionItem(
  index: LineIndex,
  item: ServiceCompletionItem,
  markdown = true
): CompletionItem {
  const out: CompletionItem = {
    label: item.label,
    kind: COMPLETION_KIND[item.kind],
    textEdit: { range: toRange(index, item.range), newText: item.insertText },
  };
  if (item.detail !== undefined) out.detail = item.detail;
  if (item.documentation !== undefined) out.documentation = toMarkup(item.documentation, markdown);
  return out;
}

/** A service fold by line as an LSP folding range. */
export function toFoldingRange(fold: LineFoldingRange): FoldingRange {
  const { startLine, endLine, kind } = fold;
  return kind === 'comment' ? { startLine, endLine, kind: 'comment' } : { startLine, endLine };
}

/**
 * `semanticTokens/full` data: the snapshot's per-line tokens, or the whole multi-line tokens
 * when the client has `multilineTokenSupport`.
 */
export function semanticTokenData(doc: DocumentSnapshot, multiline: boolean): number[] {
  return encodeSemanticTokens(
    multiline
      ? lineSemanticTokens(doc.text, doc.semanticTokens(), { index: doc.lines(), multiline })
      : doc.lineSemanticTokens()
  );
}
