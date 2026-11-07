/**
 * Info completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds mapped to items. An
 * item is offered only when the parser tests its kind at the cursor: `info` at the start,
 * `showInfo` after `info` (on its line or a later one, before any statement), and `title`,
 * `accTitle:` and `accDescr` at the start of a line. Inside a statement's text (probe modes
 * `title`, `accTitle`, `accDescr`) and outside code nothing is offered.
 */
import type {
  CompletionItem,
  CompletionKind,
  DocumentView,
  ProbeResult,
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { infoDocs } from '../generated/docs.ts';
import type { InfoDocument } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';

interface KeywordItem {
  readonly kind: number;
  readonly label: string;
  readonly item: CompletionKind;
  /** Text inserted, when it is not the label. */
  readonly insert?: string;
}

/** Everything completion offers, in the order it is offered. */
const ITEMS: readonly KeywordItem[] = [
  { kind: T.Info, label: 'info', item: 'keyword' },
  { kind: T.ShowInfo, label: 'showInfo', item: 'keyword' },
  { kind: T.Title, label: 'title', item: 'keyword', insert: 'title ' },
  { kind: T.AccTitle, label: 'accTitle', item: 'keyword', insert: 'accTitle: ' },
  { kind: T.AccDescr, label: 'accDescr', item: 'keyword', insert: 'accDescr: ' },
];

/** Index of the last token of `tokens` starting at or before `offset`, or -1. */
function tokenBefore(tokens: TokenStream, offset: number): number {
  let lo = 0;
  let hi = tokens.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((tokens.start[mid] ?? 0) <= offset) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** The probed word's range: the prefix, plus the rest of the word after the cursor. */
function wordRange(text: string, tokens: TokenStream | undefined, probe: ProbeResult): Range {
  const o = probe.offset;
  let end = o;
  const i = tokens ? tokenBefore(tokens, o) : -1;
  if (tokens && i >= 0 && (tokens.start[i] ?? 0) < o && o < (tokens.end[i] ?? 0))
    end = tokens.end[i] ?? o;
  // A word stops at the first blank, line break or `:` after the cursor.
  const stop = /[\s:]/.exec(text.slice(o, end));
  if (stop) end = o + stop.index;
  return { start: probe.prefix.start, end };
}

export function infoCompletions(
  probe: ProbeResult,
  doc: DocumentView<InfoDocument>
): CompletionItem[] {
  if (probe.mode !== 'INITIAL') return [];
  const { text, result } = doc;
  const expected = new Set(probe.expected);
  const range = wordRange(text, result.tokens, probe);
  const prefix = text.slice(range.start, probe.offset);
  const out: CompletionItem[] = [];
  for (const k of ITEMS) {
    if (!expected.has(k.kind) || !k.label.startsWith(prefix)) continue;
    const documentation = infoDocs[k.kind];
    out.push({
      label: k.label,
      kind: k.item,
      insertText: k.insert ?? k.label,
      range,
      ...(documentation === undefined ? {} : { documentation }),
    });
  }
  return out;
}
