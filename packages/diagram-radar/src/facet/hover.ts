/**
 * Radar hover (DESIGN §4.5, D93): an axis name, where it is declared or named by a detailed
 * entry, shows the label of the axis it refers to, the first `axis` of that name (D358), says
 * when it repeats an earlier axis (v12 draws both) and when an entry names no axis (its value is
 * ignored, D356); a keyword the
 * one-line doc of the grammar file (`generated/docs.ts`). Never a preview.
 */
import { LineIndex } from '@mermaid-js/core/parser-kit';
import type { DocumentView, Hover, HoverTarget, Range } from '@mermaid-js/core/parser-kit';
import { radarDocs } from '../generated/docs.ts';
import type { RadarAxisNode, RadarDocument, RadarEntryNode } from '../parser/ast.ts';
import { T, TEXT_STATEMENTS } from '../parser/tokens.ts';
import { code, declaredAxes, span } from './tables.ts';

/** Tokens with a doc that hover leaves alone: punctuation and values. */
const NO_DOC = new Set<number>([T.String, T.Number, T.Id]);

const inside = (offset: number, r: Range) => r.start <= offset && offset <= r.end;

function axisHover(name: string, at: number, doc: DocumentView<RadarDocument>): string {
  const head = `**axis** ${code(name)}`;
  const axes = declaredAxes(doc.result.ast).get(name) ?? [];
  const [first] = axes;
  if (!first) return `${head}\n\nNo axis is named ${code(name)}, so this value is ignored.`;
  // D358: every occurrence refers to the first `axis`, so it shows that axis's label.
  const label = (a: RadarAxisNode) =>
    a.label === undefined ? 'No label: the chart shows the name.' : `Label: ${code(a.label)}`;
  const own = axes.find((a) => inside(at, a.nameRange));
  if (!own || own === first) return `${head}\n\n${label(first)}`;
  const line = new LineIndex(doc.text).position(first.nameRange.start).line + 1;
  const drawn = own.label === undefined ? 'with its name' : `labelled ${code(own.label)}`;
  return `${head}\n\n${label(first)}\n\nRepeated: this refers to the first \`axis ${name}\`, at line ${line}. v12 still draws a second spoke, ${drawn}, and entries \`${name}: …\` give both the same value.`;
}

/** The detailed entry whose axis name is under `offset`, if any. */
function entryAt(doc: RadarDocument, offset: number): RadarEntryNode | undefined {
  for (const n of doc.children) {
    if (n.type !== 'Curve' || !inside(offset, n.range)) continue;
    return n.children.find((e) => e.axisRange !== undefined && inside(offset, e.axisRange));
  }
  return undefined;
}

export function radarHover(at: HoverTarget, doc: DocumentView<RadarDocument>): Hover | undefined {
  const { text } = doc;
  if (at.symbol?.kind === 'axis') {
    return { range: at.symbol.range, contents: axisHover(at.symbol.name, at.offset, doc) };
  }
  // An entry naming no axis has no symbol (D358): its name is still described.
  const entry = entryAt(doc.result.ast, at.offset);
  if (entry?.axis !== undefined && entry.axisRange) {
    return { range: entry.axisRange, contents: axisHover(entry.axis, at.offset, doc) };
  }
  const t = at.token;
  if (!t || NO_DOC.has(t.kind)) return undefined;
  let range = t.range;
  // A statement token holds its text too: only the keyword is hovered.
  const word = TEXT_STATEMENTS[t.kind]?.word;
  if (word !== undefined) {
    const start =
      range.start + (/^[\t ]*/.exec(text.slice(range.start, range.end))?.[0].length ?? 0);
    range = span(start, start + word.length);
  }
  if (at.offset < range.start || at.offset > range.end) return undefined;
  const docText = radarDocs[t.kind];
  if (docText === undefined) return undefined;
  return { range, contents: `**${code(text.slice(range.start, range.end))}**\n\n${docText}` };
}
