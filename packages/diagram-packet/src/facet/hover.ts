/**
 * Packet hover (DESIGN §4.5, D93): a field's bits, `:` or label show its label and its resolved
 * range and width (what `+8` stands for), or why it is not drawn (the parser's `dropped`: a
 * D341 error or the row cap, D342); a keyword the one-line doc of
 * the grammar file (`generated/docs.ts`). Never a preview.
 */
import type { DocumentView, Hover, HoverTarget, Range } from '@mermaid-js/core/parser-kit';
import { packetDocs } from '../generated/docs.ts';
import { MAX_PACKET_ROWS } from '../normalise.ts';
import type { PacketDocument, PacketFieldNode } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { code, span } from './tables.ts';

/** Statement tokens that hold their text too: only the keyword is hovered. */
const VALUE_WORDS: Readonly<Partial<Record<number, string>>> = {
  [T.Title]: 'title',
  [T.AccTitle]: 'accTitle',
  [T.AccDescr]: 'accDescr',
};

const inside = (offset: number, r: Range) => r.start <= offset && offset <= r.end;

function fieldHover(node: PacketFieldNode): string {
  const head = `**field** ${code(node.label)}`;
  const { dropped } = node;
  if (dropped) {
    const why =
      dropped.reason === 'error'
        ? dropped.message
        : `it lies past the ${MAX_PACKET_ROWS}-row limit of a packet.`;
    return `${head}\n\nNot drawn: ${why}`;
  }
  const bits = node.end - node.start + 1;
  const where =
    bits === 1 ? `Bit ${node.start} · 1 bit` : `Bits ${node.start}-${node.end} · ${bits} bits`;
  return `${head}\n\n${where}`;
}

export function packetHover(at: HoverTarget, doc: DocumentView<PacketDocument>): Hover | undefined {
  const { text, result } = doc;
  for (const node of result.ast.children) {
    if (node.type !== 'Field' || !inside(at.offset, node.range)) continue;
    let range = node.range;
    if (inside(at.offset, node.bitsRange)) range = node.bitsRange;
    else if (inside(at.offset, node.labelRange)) range = at.symbol?.range ?? node.labelRange;
    return { range, contents: fieldHover(node) };
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
