/**
 * Wardley hover (DESIGN §4.5, D93, D428): a node name, where it is declared or referred to,
 * shows what the map draws for it, its kind and its visibility and evolution in percent (the
 * model's values: the last statement for the name wins, as v12 merged them), and says when no
 * anchor or component has the name; a coordinate shows the percentage it is read as (up to 1 a
 * fraction of the axis, above 1 a percentage); a keyword the one-line doc of the grammar file
 * (`generated/docs.ts`). Never a preview.
 */
import type { DocumentView, Hover, HoverTarget } from '@mermaid-js/core/parser-kit';
import { wardleyDocs } from '../generated/docs.ts';
import type { WardleyModel, WardleyNode } from '../model.ts';
import type { WardleyDocument, WardleyName } from '../parser/ast.ts';
import { T, TEXT_STATEMENTS } from '../parser/tokens.ts';
import {
  code,
  coordinatesOf,
  declarationKind,
  declaredNodes,
  inside,
  percent,
  referencesOf,
  showPercent,
  span,
} from './tables.ts';

/** Tokens with a doc that hover leaves alone: names, values and text. */
const NO_DOC = new Set<number>([T.String, T.Decimal, T.Int, T.Id, T.Name, T.LinkLabel]);

/** The model's node for `name`: by id, then by the first label (how v12 resolved link ends). */
function nodeOf(model: WardleyModel, name: string): WardleyNode | undefined {
  return model.nodes.find((n) => n.id === name) ?? model.nodes.find((n) => n.label === name);
}

function nodeHover(name: string, doc: DocumentView<WardleyDocument>): string {
  const first = declaredNodes(doc.result.ast).get(name)?.[0];
  // The facet's own parse: its model is a WardleyModel.
  const model = doc.result.model as WardleyModel;
  const node = first && nodeOf(model, name);
  if (!first || !node) {
    return `**node** ${code(name)}\n\nNo anchor or component is named ${code(name)}.`;
  }
  const lines = [
    `**${declarationKind(first)}** ${code(name)}`,
    `Visibility ${showPercent(node.y)}, evolution ${showPercent(node.x)}.`,
  ];
  const trend = model.trends.find((t) => t.nodeId === node.id);
  if (trend) lines.push(`Evolves to ${showPercent(trend.targetX)}.`);
  return lines.join('\n\n');
}

/** The name under `offset` that refers to a node, if any (one no node has has no symbol). */
function referenceAt(doc: WardleyDocument, offset: number): WardleyName | undefined {
  for (const n of doc.children) {
    if (!inside(offset, n.range)) continue;
    return referencesOf(n).find((r) => inside(offset, r.range));
  }
  return undefined;
}

function coordinateHover(doc: DocumentView<WardleyDocument>, offset: number): Hover | undefined {
  for (const n of doc.result.ast.children) {
    if (!inside(offset, n.range)) continue;
    for (const { axis, number } of coordinatesOf(n)) {
      if (!inside(offset, number.range)) continue;
      const v = number.value;
      const how =
        v <= 1
          ? 'a value up to 1 is a fraction of it'
          : 'a value above 1 is a percentage (`1.0` is 100 %)';
      const written = doc.text.slice(number.range.start, number.range.end);
      const contents = `**${axis}** ${code(written)}\n\n${showPercent(percent(v))} of the axis: ${how}.`;
      return { range: number.range, contents };
    }
  }
  return undefined;
}

export function wardleyHover(
  at: HoverTarget,
  doc: DocumentView<WardleyDocument>
): Hover | undefined {
  const { text } = doc;
  if (at.symbol?.kind === 'node') {
    return { range: at.symbol.range, contents: nodeHover(at.symbol.name, doc) };
  }
  // A reference to a name no anchor or component has has no symbol (D427): still described.
  const ref = referenceAt(doc.result.ast, at.offset);
  if (ref) return { range: ref.range, contents: nodeHover(ref.value, doc) };
  const coordinate = coordinateHover(doc, at.offset);
  if (coordinate) return coordinate;
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
  const docText = wardleyDocs[t.kind];
  if (docText === undefined) return undefined;
  return { range, contents: `**${code(text.slice(range.start, range.end))}**\n\n${docText}` };
}
