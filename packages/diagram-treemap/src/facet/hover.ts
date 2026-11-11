/**
 * Treemap hover (DESIGN §4.5, D93): a section's name shows its summed value (as the renderer
 * prints it, through `valueFormat`) and how many leaves it holds; a leaf's name or value its
 * value as printed, and what v12 read from a value not written as a plain number (D402); a class
 * name, in its `classDef` or after `:::`, the styles its `classDef`s give it; a keyword the
 * one-line doc of the grammar file (`generated/docs.ts`). Never a preview.
 */
import type { DocumentView, Hover, HoverTarget } from '@mermaid-js/core/parser-kit';
import { treemapDocs } from '../generated/docs.ts';
import type { TreemapModel } from '../model.ts';
import type { TreemapDocument, TreemapLeafNode, TreemapRowNode } from '../parser/ast.ts';
import { isPlainNumber } from '../parser/convert.ts';
import { T } from '../parser/tokens.ts';
import { code, inside, span, statementAt } from './tables.ts';
import { drawnValue, valuesOf } from './values.ts';
import type { Values } from './values.ts';
import { keywordHover } from '@mermaid-js/shared/parser/facet';

/** Tokens that hold the statement's text too: only their keyword is hovered. */
const KEYWORD_WORDS: Readonly<Partial<Record<number, string>>> = {
  [T.Title]: 'title',
  [T.AccTitle]: 'accTitle',
  [T.AccDescr]: 'accDescr',
  [T.ClassDef]: 'classDef',
};

const leaves = (n: number) => (n === 1 ? 'its one leaf' : `its ${n} leaves`);

function rowHover(row: TreemapRowNode, v: Values): string {
  const node = v.nodes.get(row.id);
  if (row.type === 'Leaf') return `**leaf** ${code(row.name)}\n\n${leafValue(row, v)}`;
  const total = node ? v.totals.get(node) : undefined;
  const head = `**section** ${code(row.name)}`;
  if (!total || total.leaves === 0) return `${head}\n\nNo leaves under it, so its value is 0.`;
  return `${head}\n\nValue: ${drawnValue(total.value, v)}, the sum of ${leaves(total.leaves)}.`;
}

function leafValue(leaf: TreemapLeafNode, v: Values): string {
  const read = isPlainNumber(leaf.valueText)
    ? ''
    : `\n\nWritten ${code(leaf.valueText)}, which is read as ${Number.isNaN(leaf.value) ? 'not a number' : code(String(leaf.value))}.`;
  return `Value: ${drawnValue(leaf.value, v)}${read}`;
}

function valueHover(leaf: TreemapLeafNode, v: Values): string {
  const format = v.valueFormat === ',' ? '' : ` (\`valueFormat\` ${code(v.valueFormat)})`;
  return `**value** ${code(leaf.valueText)} of ${code(leaf.name)}${format}\n\n${leafValue(leaf, v)}`;
}

function classHover(name: string, model: TreemapModel): string {
  const head = `**class** ${code(name)}`;
  const c = model.classes.find((x) => x.name === name);
  if (!c) return `${head}\n\nNo \`classDef\` defines ${code(name)}, so it styles nothing.`;
  const styles = c.styles.map((s) => s.trim()).filter((s) => s !== '');
  if (styles.length === 0) return `${head}\n\nIts \`classDef\` gives no styles.`;
  return `${head}\n\nStyles: ${styles.map(code).join(', ')}`;
}

export function treemapHover(
  at: HoverTarget,
  doc: DocumentView<TreemapDocument>
): Hover | undefined {
  const { text, result } = doc;
  if (at.symbol?.kind === 'class') {
    return {
      range: at.symbol.range,
      contents: classHover(at.symbol.name, result.model as TreemapModel),
    };
  }
  const n = statementAt(result.ast, at.offset);
  if (n?.type === 'Section' || n?.type === 'Leaf') {
    const v = valuesOf(text, result);
    if (inside(at.offset, n.nameRange)) return { range: n.nameRange, contents: rowHover(n, v) };
    if (n.type === 'Leaf' && inside(at.offset, n.valueRange))
      return { range: n.valueRange, contents: valueHover(n, v) };
  }
  const t = at.token;
  if (!t) return undefined;
  return keywordHover(text, at.offset, t.range, KEYWORD_WORDS[t.kind], treemapDocs[t.kind]);
}
