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
import type { PacketDocument, PacketFieldNode } from '../parser/ast.ts';
import { parsePacket } from '../parser/parser.ts';
import { T } from '../parser/tokens.ts';
import { HEADER_LINE, ITEMS, span, tokenBefore } from './tables.ts';
import { wordRange } from '@mermaid-js/shared/parser/facet';
import { keywordItem } from '@mermaid-js/shared/parser/facet';

/** Whether `at` is on the `packet` line, after `packet` (or `packet-beta`). */
function onHeaderLine(text: string, at: number): boolean {
  let lineStart = at;
  while (lineStart > 0 && !/[\r\n]/.test(text.charAt(lineStart - 1))) lineStart--;
  return /^[\t ]*packet(?:-beta)?[\t ]+$/.test(text.slice(lineStart, at));
}

/**
 * The bit a field written at `at`, a statement start, starts at: v12's `lastBit + 1` after the
 * text above. The parser decides it, broken fields above included (a field whose bits were read
 * moves the count on though its label failed, and it has no AST node): a `+1` field put at `at`
 * resolves to that bit. Only the text after the last field node above is parsed again, behind a
 * field `0-<lastBit>` that stands for everything before it, so the cost is that of the lines
 * since the last whole field, not of the document. `lastBit` after a node is its end, or its
 * start for a reversed range (v12's `populate`, D341); `+0` has `end = start - 1`, which is it.
 */
function nextBit(ast: PacketDocument, text: string, at: number): number {
  let field: PacketFieldNode | undefined;
  for (const node of ast.children) {
    if (node.range.end > at) break;
    if (node.type === 'Field') field = node;
  }
  let src = `${text.slice(0, at)}+1: ""`;
  let config: Record<string, unknown> | undefined;
  if (field) {
    const dropped = field.dropped;
    const reversed = dropped?.reason === 'error' && dropped.code === 'PACKET_END_BEFORE_START';
    const last = reversed ? field.start : field.end;
    const before = last < 0 ? '' : `\n0-${last}: ""`;
    src = `packet${before}${text.slice(field.range.end, at)}+1: ""`;
    // One row for the stand-in field: rows do not move start bits, and it stays one piece.
    config = { bitsPerRow: Math.max(1, last + 1) };
  }
  const { children } = parsePacket(src, { config }).ast;
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
  const range = wordRange(text, result.tokens, probe, /[\s"':+-]/);
  const prefix = text.slice(range.start, probe.offset);
  const header = onHeaderLine(text, range.start);
  const out: CompletionItem[] = [];
  const offer = (item: CompletionItem) => {
    if (item.label.startsWith(prefix)) out.push(item);
  };
  for (const k of ITEMS) {
    if (!expected.has(k.kind) || (header && !HEADER_LINE.has(k.kind))) continue;
    offer(keywordItem(k, range, packetDocs[k.kind]));
  }
  // A field may start here (not only its end bit after `-`): the next free bit.
  if (!header && expected.has(T.Int) && expected.has(T.Plus)) {
    const label = String(nextBit(result.ast, text, range.start));
    offer({ label, kind: 'value', insertText: label, range, detail: 'the next free bit' });
  }
  return out;
}
