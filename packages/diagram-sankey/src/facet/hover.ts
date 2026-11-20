/**
 * Sankey hover (DESIGN §4.5, D93): a node name shows what flows into and out of the node (the
 * values the layout draws, D394, over every row naming it); a value field the number v12 read
 * from it (`parseFloat`, so the text after the number is dropped) and why the link counts as 0
 * when it does; `sankey` the one-line doc of the grammar file (`generated/docs.ts`).
 */
import type { DocumentView, Hover, HoverTarget } from '@mermaid-js/core/parser-kit';
import { sankeyDocs } from '../generated/docs.ts';
import type { SankeyModel } from '../model.ts';
import type { SankeyDocument, SankeyField } from '../parser/ast.ts';
import { SankeyKind as T } from '../parser/tokens.ts';
import { invalidity, readValue, trailingTextMessage } from '../parser/values.ts';
import { code } from './tables.ts';
import { inside, keywordHover } from '@mermaid-js/shared/parser/facet';

/** A sum as it reads, without the binary noise of adding decimals (`0.1 + 0.2`). */
const total = (n: number) => String(Number(n.toPrecision(12)));

const links = (n: number) => (n === 1 ? '1 link' : `${n} links`);

function nodeHover(name: string, model: SankeyModel): string {
  let inSum = 0;
  let inCount = 0;
  let outSum = 0;
  let outCount = 0;
  for (const l of model.links) {
    if (l.target === name) {
      inSum += l.flow;
      inCount++;
    }
    if (l.source === name) {
      outSum += l.flow;
      outCount++;
    }
  }
  const side = (label: string, sum: number, count: number) =>
    count === 0 ? `${label}: 0` : `${label}: ${total(sum)} (${links(count)})`;
  return `**node** ${code(name)}\n\n${side('In', inSum, inCount)} · ${side('out', outSum, outCount)}`;
}

function valueHover(field: SankeyField): string {
  const read = readValue(field.text);
  const head = `**value** ${String(read.value)}`;
  const why = invalidity(read.value);
  if (why !== undefined) return `${head}\n\n${code(field.text)} ${why}, so the link counts as 0.`;
  // The parse's SANKEY_VALUE_TRAILING_TEXT message.
  return read.rest === undefined ? head : `${head}\n\n${trailingTextMessage(field.text, read)}`;
}

export function sankeyHover(at: HoverTarget, doc: DocumentView<SankeyDocument>): Hover | undefined {
  const { text, result } = doc;
  const model = result.model as SankeyModel;
  const s = at.symbol;
  if (s?.kind === 'node') return { range: s.range, contents: nodeHover(s.name, model) };
  const t = at.token;
  if (!t) return undefined;
  if (t.kind === T.Sankey)
    return keywordHover(text, at.offset, t.range, undefined, sankeyDocs[T.Sankey]);
  // A value, bare or quoted.
  for (const link of result.ast.children) {
    if (inside(at.offset, link.value.range))
      return { range: link.value.range, contents: valueHover(link.value) };
  }
  return undefined;
}
