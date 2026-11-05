/**
 * Runs a Monarch definition with Monaco's own Monarch compiler and lexer, in Node: the
 * tokens Monaco paints before semantic tokens arrive. Test-only.
 */
import type * as Monaco from 'monaco-editor';
// Monaco's internals, as its standalone editor runs them (no DOM needed).
import { compile } from 'monaco-editor/editor/standalone/common/monarch/monarchCompile.js';
import { MonarchTokenizer } from 'monaco-editor/editor/standalone/common/monarch/monarchLexer.js';

export interface MonarchToken {
  /** 0-based line. */
  readonly line: number;
  /** UTF-16 column of the token's start. */
  readonly start: number;
  readonly end: number;
  readonly type: string;
}

/** Every token of `text`, line by line, as Monaco's tokenizer gives them. */
export function monarchTokens(
  def: Monaco.languages.IMonarchLanguage,
  text: string,
  languageId = 'mermaid'
): MonarchToken[] {
  const lexer = compile(languageId, def);
  // The one setting it reads (the longest line it tokenizes), never changed.
  const config = {
    getValue: () => 20_000,
    onDidChangeConfiguration: () => ({ dispose: () => undefined }),
  };
  const tokenizer = new MonarchTokenizer({}, {}, languageId, lexer, config);
  const lines = text.split('\n');
  const out: MonarchToken[] = [];
  let state = tokenizer.getInitialState();
  for (const [n, line] of lines.entries()) {
    const r = tokenizer.tokenize(line, n < lines.length - 1, state);
    r.tokens.forEach((t, i) => {
      const end = Math.min(r.tokens[i + 1]?.offset ?? line.length, line.length);
      if (end > t.offset) out.push({ line: n, start: t.offset, end, type: t.type });
    });
    state = r.endState;
  }
  return out;
}

/** The styled tokens of `text` as `text:type`, unstyled (`''`) ones left out. */
export function monarchSpans(def: Monaco.languages.IMonarchLanguage, text: string): string[] {
  const lines = text.split('\n');
  return monarchTokens(def, text)
    .filter((t) => t.type !== '')
    .map((t) => `${lines[t.line]!.slice(t.start, t.end).trim()}:${t.type}`);
}
