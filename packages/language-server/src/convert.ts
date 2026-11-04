/**
 * Service results → LSP types (D98). The service speaks UTF-16 offsets, which is LSP's
 * default (and only mandatory) position encoding, so a `LineIndex` line/column pair is an LSP
 * position as it is.
 */
import type {
  CompletionItem as ServiceCompletionItem,
  CompletionKind,
  Diagnostic as ServiceDiagnostic,
  FoldingRange as ServiceFoldingRange,
  LineIndex,
  Range as ServiceRange,
  SemanticToken,
} from '@mermaid-js/language-service';
import { SEMANTIC_TOKEN_LEGEND } from '@mermaid-js/language-service';
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
    message: d.expected?.length ? `${d.message}\nExpected: ${d.expected.join(', ')}` : d.message,
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
 * as plain text with the bold and code marks taken out.
 */
export function toMarkup(value: string, markdown: boolean): MarkupContent {
  return markdown
    ? { kind: 'markdown', value }
    : { kind: 'plaintext', value: value.replace(/\*\*|`/g, '') };
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

/** A last line that only closes its block: it stays visible when the block is folded. */
const CLOSER = /^[ \t]*(?:end|\}|---|\}%%)[ \t]*(?:\r\n|\r|\n)?$/;

/**
 * Folding ranges by line. A range ends on the line of its last character, or the line before
 * when that line only closes the block (`end`, `}`, `---`); ranges within one line are left
 * out, and so is a second range on the same start line (clients keep one).
 */
export function toFoldingRanges(
  index: LineIndex,
  text: string,
  ranges: readonly ServiceFoldingRange[]
): FoldingRange[] {
  const out: FoldingRange[] = [];
  const seen = new Set<number>();
  for (const { range, kind } of ranges) {
    const startLine = index.position(range.start).line;
    let endLine = index.position(Math.max(range.start, range.end - 1)).line;
    if (CLOSER.test(text.slice(index.offset(endLine, 0), range.end))) endLine--;
    if (endLine <= startLine || seen.has(startLine)) continue;
    seen.add(startLine);
    out.push(kind === 'comment' ? { startLine, endLine, kind: 'comment' } : { startLine, endLine });
  }
  return out;
}

const TYPE_INDEX = new Map<string, number>(SEMANTIC_TOKEN_LEGEND.types.map((t, i) => [t, i]));
const MODIFIER_BIT = new Map<string, number>(
  SEMANTIC_TOKEN_LEGEND.modifiers.map((m, i) => [m, 1 << i])
);

/**
 * `semanticTokens/full` data: five integers per token (line delta, start delta, length, type,
 * modifier bits), in document order. A token that spans lines is cut into one token per line
 * (line breaks left out) unless the client has `multilineTokenSupport`. A token that starts
 * before the previous one ends is dropped: deltas must never go backwards.
 */
export function encodeSemanticTokens(
  index: LineIndex,
  text: string,
  tokens: readonly SemanticToken[],
  multiline = false
): number[] {
  const data: number[] = [];
  let prevLine = 0;
  let prevChar = 0;
  let prevEnd = 0;
  const emit = (line: number, char: number, length: number, type: number, mods: number) => {
    if (length <= 0) return;
    data.push(line - prevLine, line === prevLine ? char - prevChar : char, length, type, mods);
    prevLine = line;
    prevChar = char;
  };
  for (const token of tokens) {
    const { start, end } = token.range;
    if (start < prevEnd || end <= start) continue;
    prevEnd = end;
    const type = TYPE_INDEX.get(token.type) ?? 0;
    let mods = 0;
    for (const m of token.modifiers) mods |= MODIFIER_BIT.get(m) ?? 0;
    const from = index.position(start);
    const to = index.position(end);
    if (multiline || from.line === to.line) {
      emit(from.line, from.column, end - start, type, mods);
      continue;
    }
    for (let line = from.line; line <= to.line; line++) {
      // A continuation piece starts after the line's indentation.
      let lineStart = line === from.line ? start : index.offset(line, 0);
      if (line !== from.line)
        while (lineStart < end && (text[lineStart] === ' ' || text[lineStart] === '\t'))
          lineStart++;
      // `offset(line, ∞)` clamps to the line's end, before its line break.
      const lineEnd = line === to.line ? end : index.offset(line, text.length);
      emit(line, lineStart - index.offset(line, 0), lineEnd - lineStart, type, mods);
    }
  }
  return data;
}
