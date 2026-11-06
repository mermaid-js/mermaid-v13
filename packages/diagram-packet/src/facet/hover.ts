/**
 * Packet hover (DESIGN §4.5, D93): a field's bits, `:` or label show its label and its resolved
 * range and width (what `+8` stands for), or why it is not drawn; a keyword the one-line doc of
 * the grammar file (`generated/docs.ts`). Never a preview.
 */
import type {
  DocumentView,
  Hover,
  HoverTarget,
  ParseResult,
  Range,
} from '@mermaid-js/core/parser-kit';
import { packetDocs } from '../generated/docs.ts';
import type { PacketModel } from '../model.ts';
import { MAX_PACKET_ROWS } from '../normalise.ts';
import type { PacketDocument, PacketFieldNode } from '../parser/ast.ts';
import { PACKET_SEMANTIC_ERRORS } from '../parser/parser.ts';
import { T } from '../parser/tokens.ts';
import { code, span } from './tables.ts';

/** Statement tokens that hold their text too: only the keyword is hovered. */
const VALUE_WORDS: Readonly<Partial<Record<number, string>>> = {
  [T.Title]: 'title',
  [T.AccTitle]: 'accTitle',
  [T.AccDescr]: 'accDescr',
};

const inside = (offset: number, r: Range) => r.start <= offset && offset <= r.end;

function fieldHover(node: PacketFieldNode, result: ParseResult<unknown, PacketDocument>): string {
  const head = `**field** ${code(node.label)}`;
  const model = result.model as PacketModel;
  if (model.fields.some((f) => f.astId === node.id)) {
    const bits = node.end - node.start + 1;
    const where =
      bits === 1 ? `Bit ${node.start} · 1 bit` : `Bits ${node.start}-${node.end} · ${bits} bits`;
    return `${head}\n\n${where}`;
  }
  // D341: a misplaced field reports its error on its bits; else the row cap dropped it (D342).
  const error = result.diagnostics.find(
    (d) =>
      PACKET_SEMANTIC_ERRORS.includes(d.code) &&
      d.range.start === node.bitsRange.start &&
      d.range.end === node.bitsRange.end
  );
  const why = error?.message ?? `the packet has more than ${MAX_PACKET_ROWS} rows.`;
  return `${head}\n\nNot drawn: ${why}`;
}

export function packetHover(at: HoverTarget, doc: DocumentView<PacketDocument>): Hover | undefined {
  const { text, result } = doc;
  for (const node of result.ast.children) {
    if (node.type !== 'Field' || !inside(at.offset, node.range)) continue;
    let range = node.range;
    if (inside(at.offset, node.bitsRange)) range = node.bitsRange;
    else if (inside(at.offset, node.labelRange)) range = at.symbol?.range ?? node.labelRange;
    return { range, contents: fieldHover(node, result) };
  }
  const t = at.token;
  if (!t) return undefined;
  let range = t.range;
  const word = VALUE_WORDS[t.kind];
  if (word !== undefined) {
    const start =
      range.start + (/^[\t ]*/.exec(text.slice(range.start, range.end))?.[0].length ?? 0);
    range = span(start, start + word.length);
  }
  if (at.offset < range.start || at.offset > range.end) return undefined;
  const docText = packetDocs[t.kind];
  if (docText === undefined || t.kind === T.String || t.kind === T.Colon) return undefined;
  return { range, contents: `**${code(text.slice(range.start, range.end))}**\n\n${docText}` };
}
