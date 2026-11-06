/**
 * Radar hover (DESIGN §4.5, D93): an axis name, where it is declared or named by a detailed
 * entry, shows the label the chart draws for it (D358), says when it repeats an earlier axis
 * (v12 draws both) and when an entry names no axis (its value is ignored, D356); a keyword the
 * one-line doc of the grammar file (`generated/docs.ts`). Never a preview.
 */
import { LineIndex } from '@mermaid-js/core/parser-kit';
import type { DocumentView, Hover, HoverTarget, Range } from '@mermaid-js/core/parser-kit';
import { radarDocs } from '../generated/docs.ts';
import type { RadarAxisNode, RadarDocument } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { code, span } from './tables.ts';

/** Statement tokens that hold their text too: only the keyword is hovered. */
const VALUE_WORDS: Readonly<Partial<Record<number, string>>> = {
  [T.Title]: 'title',
  [T.AccTitle]: 'accTitle',
  [T.AccDescr]: 'accDescr',
};
/** Tokens with a doc that hover leaves alone: punctuation and values. */
const NO_DOC = new Set<number>([T.String, T.Number, T.Id]);

const inside = (offset: number, r: Range) => r.start <= offset && offset <= r.end;

function axisHover(name: string, at: number, doc: DocumentView<RadarDocument>): string {
  const head = `**axis** ${code(name)}`;
  const axes = doc.result.ast.children.filter(
    (n): n is RadarAxisNode => n.type === 'Axis' && n.name === name
  );
  const own = axes.find((a) => inside(at, a.nameRange));
  const shown = own ?? axes[0];
  if (!shown) return `${head}\n\nNo axis is named ${code(name)}, so this value is ignored.`;
  const label =
    shown.label === undefined
      ? 'No label: the chart shows the name.'
      : `Label: ${code(shown.label)}`;
  const first = axes[0];
  if (!own || !first || first === own) return `${head}\n\n${label}`;
  const line = new LineIndex(doc.text).position(first.nameRange.start).line + 1;
  return `${head}\n\n${label}\n\nRepeated: an axis ${code(name)} comes first, at line ${line}. Both are drawn; entries \`${name}: …\` give both the same value.`;
}

export function radarHover(at: HoverTarget, doc: DocumentView<RadarDocument>): Hover | undefined {
  const { text } = doc;
  if (at.symbol?.kind === 'axis') {
    return { range: at.symbol.range, contents: axisHover(at.symbol.name, at.offset, doc) };
  }
  const t = at.token;
  if (!t || NO_DOC.has(t.kind)) return undefined;
  let range = t.range;
  const word = VALUE_WORDS[t.kind];
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
