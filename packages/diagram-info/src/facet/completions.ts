/**
 * Info completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds mapped to items. An
 * item is offered only when the parser tests its kind at the cursor: `info` at the start,
 * `showInfo` after `info` (on its line or a later one, before any statement), and `title`,
 * `accTitle:` and `accDescr` at the start of a line. Inside a statement's text (probe modes
 * `title`, `accTitle`, `accDescr`) and outside code nothing is offered.
 */
import type { CompletionItem, DocumentView, ProbeResult } from '@mermaid-js/core/parser-kit';
import { infoDocs } from '../generated/docs.ts';
import type { InfoDocument } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import {
  keywordCompletions,
  type KindedKeywordItem,
  wordRange,
} from '@mermaid-js/shared/parser/facet';

/** Everything completion offers, in the order it is offered. */
const ITEMS: readonly KindedKeywordItem[] = [
  { kind: T.Info, label: 'info', item: 'keyword' },
  { kind: T.ShowInfo, label: 'showInfo', item: 'keyword' },
  { kind: T.Title, label: 'title', item: 'keyword', insert: 'title ' },
  { kind: T.AccTitle, label: 'accTitle', item: 'keyword', insert: 'accTitle: ' },
  { kind: T.AccDescr, label: 'accDescr', item: 'keyword', insert: 'accDescr: ' },
];

export function infoCompletions(
  probe: ProbeResult,
  doc: DocumentView<InfoDocument>
): CompletionItem[] {
  if (probe.mode !== 'INITIAL') return [];
  const { text, result } = doc;
  const expected = new Set(probe.expected);
  const range = wordRange(text, result.tokens, probe, /[\s:]/);
  const prefix = text.slice(range.start, probe.offset);
  return keywordCompletions(ITEMS, expected, prefix, range, infoDocs);
}
