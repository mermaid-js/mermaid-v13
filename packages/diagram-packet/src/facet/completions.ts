/**
 * Packet completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds mapped to items.
 * An item is offered only when the parser tests its kind at the cursor: `packet` at the start,
 * `title` after `packet`, the statements, `+` and the next start bit (v12's `lastBit + 1`) at
 * the start of a line, `:` after a field's bits and `"` after the `:`. Inside a label or a
 * statement's text (probe modes `string`, `title`, `accTitle`, `accDescr`), in bits being typed
 * after `+` or `-`, and outside code nothing is offered.
 */
import type {
  CompletionItem,
  DocumentView,
  ProbeResult,
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { packetDocs } from '../generated/docs.ts';
import type { PacketDocument } from '../parser/ast.ts';
import { parsePacket } from '../parser/parser.ts';
import { T } from '../parser/tokens.ts';
import { HEADER_LINE, ITEMS, span, tokenBefore } from './tables.ts';

/** The probed word's range: the prefix, plus the rest of the word after the cursor. */
function wordRange(text: string, tokens: TokenStream | undefined, probe: ProbeResult): Range {
  const o = probe.offset;
  let end = o;
  const i = tokens ? tokenBefore(tokens, o) : -1;
  if (tokens && i >= 0 && (tokens.start[i] ?? 0) < o && o < (tokens.end[i] ?? 0))
    end = tokens.end[i] ?? o;
  // A word stops at the first blank, line break, quote, `:`, `-` or `+` after the cursor.
  const stop = /[\s"':+-]/.exec(text.slice(o, end));
  if (stop) end = o + stop.index;
  return span(probe.prefix.start, end);
}

/** Whether `at` is on the `packet` line, after `packet` (or `packet-beta`). */
function onHeaderLine(text: string, at: number): boolean {
  let lineStart = at;
  while (lineStart > 0 && !/[\r\n]/.test(text.charAt(lineStart - 1))) lineStart--;
  return /^[\t ]*packet(?:-beta)?[\t ]+$/.test(text.slice(lineStart, at));
}

/**
 * The bit a field written at `at`, a statement start, starts at: v12's `lastBit + 1` after the
 * text above. The parser decides it, broken fields above included (their bits still move the
 * count on, D341): a `+1` field put there resolves to that bit.
 */
function nextBit(text: string, at: number): number {
  const { children } = parsePacket(`${text.slice(0, at)}+1: ""`).ast;
  const last = children[children.length - 1];
  return last?.type === 'Field' ? last.start : 0;
}

export function packetCompletions(
  probe: ProbeResult,
  doc: DocumentView<PacketDocument>
): CompletionItem[] {
  if (probe.mode !== 'INITIAL') return [];
  const { text, result } = doc;
  const expected = new Set(probe.expected);
  const range = wordRange(text, result.tokens, probe);
  const prefix = text.slice(range.start, probe.offset);
  const header = onHeaderLine(text, range.start);
  const out: CompletionItem[] = [];
  const offer = (item: CompletionItem) => {
    if (item.label.startsWith(prefix)) out.push(item);
  };
  for (const k of ITEMS) {
    if (!expected.has(k.kind) || (header && !HEADER_LINE.has(k.kind))) continue;
    const documentation = packetDocs[k.kind];
    offer({
      label: k.label,
      kind: k.item,
      insertText: k.insert ?? k.label,
      range,
      ...(k.detail === undefined ? {} : { detail: k.detail }),
      ...(documentation === undefined ? {} : { documentation }),
    });
  }
  // A field may start here (not only its end bit after `-`): the next free bit.
  if (!header && expected.has(T.Int) && expected.has(T.Plus)) {
    const label = String(nextBit(text, range.start));
    offer({ label, kind: 'value', insertText: label, range, detail: 'the next free bit' });
  }
  return out;
}
