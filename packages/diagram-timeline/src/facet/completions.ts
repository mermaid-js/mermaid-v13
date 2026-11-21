/**
 * Timeline completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds mapped to
 * items, each kept only where v12's lexer would read it as that statement. An item is offered
 * when the parser tests its kind at the cursor: the header in an empty text, `LR` and `TD`
 * after a bare `timeline` on its line, and `title`, `section`, `accTitle` and `accDescr`
 * wherever a statement may start (a line start, after the header or after `accDescr { … }` on
 * the same line). Statements need no separator, so the lexer decides: an item is dropped when
 * the text it would make lexes otherwise, inside a period, an event, a title or a section name
 * (a bare `section` or `title` takes the next line as its name). Nothing is offered in an
 * accessibility value (probe modes `acc_title`, `acc_descr`, `acc_descr_multiline`) or outside
 * code. Keywords are matched without regard to case, as the lexer reads them.
 */
import { Kind, sourceView } from '@mermaid-js/core/parser-kit';
import type { CompletionItem, DocumentView, ProbeResult } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { timelineDocs } from '../generated/docs.ts';
import type { TimelineDocument } from '../parser/ast.ts';
import { lex } from '../parser/lexer.ts';
import { T } from '../parser/tokens.ts';
import { DIRECTION_ITEMS, HEADER_ITEMS, lineBefore, span, STATEMENT_ITEMS } from './tables.ts';
import type { KeywordItem } from './tables.ts';
import { insertWithSeparator } from '@mermaid-js/shared/parser/facet';

/**
 * What already opens a keyword's value after it, so no separator is inserted (`section` before
 * ` Web`, `accTitle` before `: x`; `accDescr` before ` {` keeps the block).
 */
const OPENS = /^[\t ]*[:{]/;

const HEADER_LINE = /^[\t ]*timeline[\t ]+$/i;
const TRIVIA = new Set<number>([Kind.Comment, Kind.Directive, Kind.Space]);

/** The kind and start of the significant token of `text` holding `offset`, as v12 lexes it. */
function tokenAt(text: string, offset: number): { kind: number; start: number } | undefined {
  const pre = preprocess(text);
  const view = sourceView(
    text,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  const t = lex(text, pre.bodyStart, view);
  for (let j = 0; j < t.length; j++) {
    const kind = t.kind[j] ?? Kind.EOF;
    const start = t.start[j] ?? 0;
    if (TRIVIA.has(kind) || start > offset) continue;
    if (offset < (t.end[j] ?? 0)) return { kind, start };
  }
  return undefined;
}

export function timelineCompletions(
  probe: ProbeResult,
  doc: DocumentView<TimelineDocument>
): CompletionItem[] {
  if (probe.mode !== 'INITIAL') return [];
  const { text } = doc;
  const start = probe.prefix.start;
  const prefix = text.slice(start, probe.offset).toLowerCase();
  if (/[\n\r]/.test(prefix)) return [];
  const expected = new Set(probe.expected);
  const before = lineBefore(text, start);
  const items: KeywordItem[] = [];
  if (/^[\t ]*$/.test(before) && expected.has(T.Timeline)) items.push(...HEADER_ITEMS);
  if (HEADER_LINE.test(before)) items.push(...DIRECTION_ITEMS);
  items.push(...STATEMENT_ITEMS);
  // The word being typed, to its end (up to a blank, a line break or a `:`); at a word's
  // first character nothing is replaced.
  const end =
    prefix === ''
      ? probe.offset
      : probe.offset + (/^[^\s:{]*/.exec(text.slice(probe.offset))?.[0].length ?? 0);
  const range = span(start, end);
  const head = text.slice(0, start);
  const rest = text.slice(end);
  const out: CompletionItem[] = [];
  for (const k of items) {
    if (!expected.has(k.kind) || !k.label.toLowerCase().startsWith(prefix)) continue;
    const insert = insertWithSeparator(k.label, k.separator, rest, OPENS);
    // What v12 would read: a statement's text stands in for what the author types next.
    const sample = `${head}${insert}${/[ :]$/.test(insert) ? 'x' : ''}${rest}`;
    const t = tokenAt(sample, start);
    if (!t || !(k.reads ?? [k.kind]).includes(t.kind)) continue;
    if (t.start !== start && !DIRECTION_ITEMS.includes(k)) continue;
    const documentation = timelineDocs[k.kind];
    out.push({
      label: k.label,
      kind: k.item,
      insertText: insert,
      range,
      ...(k.detail === undefined ? {} : { detail: k.detail }),
      ...(documentation === undefined ? {} : { documentation }),
    });
  }
  return out;
}
