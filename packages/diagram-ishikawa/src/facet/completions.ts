/**
 * Ishikawa completion (DESIGN §4.5, D95, R-LANG-7, spec #519 "Language facet"): the header
 * keywords, `ishikawa` and `ishikawa-beta`, where the probe says the parser expects the header
 * (at the start of a line, after the blank and comment lines before it). Nothing else: the body
 * is free text, each line the effect or a cause. Nothing in a comment, a directive or front
 * matter. Labels are matched without regard to case, as the lexer reads the keyword.
 */
import type { CompletionItem, DocumentView, ProbeResult } from '@mermaid-js/core/parser-kit';
import { ishikawaDocs } from '../generated/docs.ts';
import type { IshikawaDocument } from '../parser/ast.ts';
import { KEYWORDS } from '../parser/keywords.ts';
import { T } from '../parser/tokens.ts';
import { LINE_BREAK, lineBefore, span } from './tables.ts';

const BLANK = /^\s*$/;

export function ishikawaCompletions(
  probe: ProbeResult,
  doc: DocumentView<IshikawaDocument>
): CompletionItem[] {
  if (probe.mode !== 'INITIAL' || !probe.expected.includes(T.Ishikawa)) return [];
  const { text } = doc;
  const { offset } = probe;
  const start = probe.prefix.start;
  const prefix = text.slice(start, offset);
  if (LINE_BREAK.test(prefix) || !BLANK.test(lineBefore(text, start, true))) return [];
  const lower = prefix.toLowerCase();
  // The rest of the word being typed goes too, when there is a prefix.
  const word = /^\S*/.exec(text.slice(offset))?.[0] ?? '';
  const range = span(start, prefix === '' ? offset : offset + word.length);
  const documentation = ishikawaDocs[T.Ishikawa];
  return KEYWORDS.filter((k) => k.startsWith(lower)).map((label) => ({
    label,
    kind: 'keyword',
    insertText: label,
    range,
    ...(documentation === undefined ? {} : { documentation }),
  }));
}
