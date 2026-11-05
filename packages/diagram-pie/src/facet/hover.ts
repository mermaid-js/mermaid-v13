/**
 * Pie hover (DESIGN §4.5, D93): a section's label or value shows its value and its share of
 * the chart, as the percentage drawn on its slice (`toFixed(0)` over the sum of every section,
 * as v12), and says when the section is a repeat or negative; a keyword the one-line doc of the
 * grammar file (`generated/docs.ts`). Never a preview.
 */
import type { DocumentView, Hover, HoverTarget, Range } from '@mermaid-js/core/parser-kit';
import { pieDocs } from '../generated/docs.ts';
import type { PieModel } from '../model.ts';
import type { PieDocument, PieSliceNode } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { code, span } from './tables.ts';

/** Statement tokens that hold their text too: only the keyword is hovered. */
const VALUE_WORDS: Readonly<Partial<Record<number, string>>> = {
  [T.Title]: 'title',
  [T.AccTitle]: 'accTitle',
  [T.AccDescr]: 'accDescr',
};

const inside = (offset: number, r: Range) => r.start <= offset && offset <= r.end;

function sliceHover(node: PieSliceNode, model: PieModel): string {
  const head = `**slice** ${code(node.label)}`;
  if (node.value < 0) {
    return `${head}\n\nValue: ${node.value}. Negative values are not allowed in pie charts, so this section is left out.`;
  }
  const first = model.sections.find((s) => s.label === node.label);
  if (!first) return head;
  const sum = model.sections.reduce((a, s) => a + s.value, 0);
  const share = sum > 0 ? ` · ${((first.value / sum) * 100).toFixed(0)}% of ${sum}` : '';
  const repeat =
    first.astId === node.id
      ? ''
      : `\n\nRepeated: this value, ${node.value}, is ignored and the first is kept.`;
  return `${head}\n\nValue: ${first.value}${share}${repeat}`;
}

export function pieHover(at: HoverTarget, doc: DocumentView<PieDocument>): Hover | undefined {
  const { text, result } = doc;
  const model = result.model as PieModel;
  const t = at.token;
  // A section: its label (quotes included) or its value.
  if (at.symbol?.kind === 'slice' || t?.kind === T.String || t?.kind === T.Number) {
    for (const node of result.ast.children) {
      if (node.type !== 'Slice') continue;
      let range: Range | undefined;
      if (inside(at.offset, node.labelRange)) range = at.symbol?.range ?? node.labelRange;
      else if (inside(at.offset, node.valueRange)) range = node.valueRange;
      if (range) return { range, contents: sliceHover(node, model) };
    }
  }
  if (!t) return undefined;
  let range = t.range;
  const word = VALUE_WORDS[t.kind];
  if (word !== undefined) {
    const start =
      range.start + (/^[\t ]*/.exec(text.slice(range.start, range.end))?.[0].length ?? 0);
    range = span(start, start + word.length);
  }
  if (at.offset < range.start || at.offset > range.end) return undefined;
  const docText = pieDocs[t.kind];
  if (docText === undefined || t.kind === T.String || t.kind === T.Colon) return undefined;
  return { range, contents: `**${code(text.slice(range.start, range.end))}**\n\n${docText}` };
}
