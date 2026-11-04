/**
 * The line shape of folding ranges and semantic tokens: what every editor shows. Monaco, the
 * LSP server and CodeMirror all use these, so one document folds and highlights the same in
 * each. Lines and characters are 0-based, characters count UTF-16 code units (LSP's default).
 */
import { LineIndex } from '@mermaid-js/core/parser-kit';
import type { FoldingRange } from './folding.ts';
import type { SemanticToken, SemanticTokenModifier, SemanticTokenType } from './semantic-tokens.ts';
import { SEMANTIC_TOKEN_LEGEND } from './semantic-tokens.ts';

/** A fold by line: `startLine` stays visible, `startLine + 1 … endLine` fold away. */
export interface LineFoldingRange {
  startLine: number;
  endLine: number;
  /** The service range's kind (`subgraph`, `frontMatter`, …). */
  kind: string;
}

/** A last line that only closes its block: it stays visible when the block is folded. */
const CLOSER = /^[ \t]*(?:end|\}|---|\}%%)[ \t]*(?:\r\n|\r|\n)?$/;

/**
 * Folding ranges by line. A range ends on the line of its last character, or the line before
 * when that line only closes the block (`end`, `}`, `---`, `}%%`); a range that then covers
 * one line is left out, and so is a second range on the same start line (editors keep one).
 */
export function lineFoldingRanges(
  text: string,
  ranges: readonly FoldingRange[],
  index: LineIndex = new LineIndex(text)
): LineFoldingRange[] {
  const out: LineFoldingRange[] = [];
  const seen = new Set<number>();
  for (const { range, kind } of ranges) {
    const startLine = index.position(range.start).line;
    let endLine = index.position(Math.max(range.start, range.end - 1)).line;
    if (CLOSER.test(text.slice(index.offset(endLine, 0), range.end))) endLine--;
    if (endLine <= startLine || seen.has(startLine)) continue;
    seen.add(startLine);
    out.push({ startLine, endLine, kind });
  }
  return out;
}

/** One semantic token on one line (or a whole multi-line token, when asked). */
export interface LineSemanticToken {
  line: number;
  character: number;
  /** UTF-16 code units; across lines (breaks counted) only with `multiline`. */
  length: number;
  type: SemanticTokenType;
  modifiers: SemanticTokenModifier[];
}

export interface LineSemanticTokenOptions {
  /** The text's line table, when the caller has one. */
  readonly index?: LineIndex;
  /** Keep a token that spans lines whole (LSP `multilineTokenSupport`). */
  readonly multiline?: boolean;
}

/**
 * Semantic tokens by line, in document order and never overlapping: a token that starts
 * before the previous one ends is dropped. A token that spans lines is cut into one piece per
 * line, line breaks left out; a continuation piece starts after the line's indentation, and
 * empty pieces (an empty line, a token ending at a line start) are left out.
 */
export function lineSemanticTokens(
  text: string,
  tokens: readonly SemanticToken[],
  options: LineSemanticTokenOptions = {}
): LineSemanticToken[] {
  const index = options.index ?? new LineIndex(text);
  const out: LineSemanticToken[] = [];
  let prevEnd = 0;
  const emit = (t: SemanticToken, line: number, character: number, length: number) => {
    if (length > 0)
      out.push({ line, character, length, type: t.type, modifiers: [...t.modifiers] });
  };
  for (const token of tokens) {
    const { start, end } = token.range;
    if (start < prevEnd || end <= start) continue;
    prevEnd = end;
    const from = index.position(start);
    const to = index.position(end);
    if (options.multiline || from.line === to.line) {
      emit(token, from.line, from.column, end - start);
      continue;
    }
    for (let line = from.line; line <= to.line; line++) {
      const lineOffset = index.offset(line, 0);
      let pieceStart = line === from.line ? start : lineOffset;
      if (line !== from.line)
        while (pieceStart < end && (text[pieceStart] === ' ' || text[pieceStart] === '\t'))
          pieceStart++;
      // `offset(line, ∞)` clamps to the line's end, before its line break.
      const pieceEnd = line === to.line ? end : index.offset(line, text.length);
      emit(token, line, pieceStart - lineOffset, pieceEnd - pieceStart);
    }
  }
  return out;
}

const TYPE_INDEX = new Map<string, number>(SEMANTIC_TOKEN_LEGEND.types.map((t, i) => [t, i]));
const MODIFIER_BIT = new Map<string, number>(
  SEMANTIC_TOKEN_LEGEND.modifiers.map((m, i) => [m, 1 << i])
);

/**
 * LSP `semanticTokens/full` data (Monaco reads the same): five integers per token (line delta,
 * start delta, length, type index, modifier bits) over {@link SEMANTIC_TOKEN_LEGEND}.
 */
export function encodeSemanticTokens(tokens: readonly LineSemanticToken[]): number[] {
  const data: number[] = [];
  let prevLine = 0;
  let prevChar = 0;
  for (const t of tokens) {
    let mods = 0;
    for (const m of t.modifiers) mods |= MODIFIER_BIT.get(m) ?? 0;
    data.push(
      t.line - prevLine,
      t.line === prevLine ? t.character - prevChar : t.character,
      t.length,
      TYPE_INDEX.get(t.type) ?? 0,
      mods
    );
    prevLine = t.line;
    prevChar = t.character;
  }
  return data;
}
