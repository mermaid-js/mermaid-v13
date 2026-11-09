/**
 * Wardley hover (DESIGN §4.5, D93, D428): a node name, where it is declared or referred to,
 * shows what the map draws for it, its kind and its visibility and evolution in percent (the
 * model's values: the last statement for the name wins, as v12 merged them), and says when no
 * anchor or component has the name (after `evolve` and `pipeline` a pipeline component's name is
 * none: the parser reads a node id there); a coordinate shows the percentage it is read as (up to 1 a
 * fraction of the axis, above 1 a percentage); a keyword the one-line doc of the grammar file
 * (`generated/docs.ts`). Never a preview.
 */
import type { DocumentView, Hover, HoverTarget } from '@mermaid-js/core/parser-kit';
import { wardleyDocs } from '../generated/docs.ts';
import type { WardleyModel, WardleyNode } from '../model.ts';
import type { WardleyDocument, WardleyName } from '../parser/ast.ts';
import { toPercent } from '../parser/convert.ts';
import { T, TEXT_STATEMENTS } from '../parser/tokens.ts';
import {
  code,
  coordinatesOf,
  declarationKind,
  declaredNodes,
  inside,
  referencesOf,
  showPercent,
  span,
} from './tables.ts';

/** Tokens with a doc that hover leaves alone: names, values and text. */
const NO_DOC = new Set<number>([T.String, T.Decimal, T.Int, T.Id, T.Name, T.LinkLabel]);

/**
 * The model's node for `name`: by id, then by the first label (how v12 resolved link ends); by
 * id only after `evolve` and `pipeline`, as the parser resolves those.
 */
function nodeOf(model: WardleyModel, name: string, idOnly: boolean): WardleyNode | undefined {
  const byId = model.nodes.find((n) => n.id === name);
  return byId ?? (idOnly ? undefined : model.nodes.find((n) => n.label === name));
}

function nodeHover(name: string, doc: DocumentView<WardleyDocument>, idOnly: boolean): string {
  const declared = declaredNodes(doc.result.ast).get(name) ?? [];
  // A pipeline component's name is no node id: only an anchor or component declares one.
  const first = idOnly ? declared.find((d) => d.type !== 'PipelineComponent') : declared[0];
  // The facet's own parse: its model is a WardleyModel.
  const model = doc.result.model as WardleyModel;
  const node = first && nodeOf(model, name, idOnly);
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

/**
 * The name under `offset` that refers to a node, if any (one no node has has no symbol), and
 * whether it names a node by id only (after `evolve` and `pipeline`).
 */
function referenceAt(
  doc: WardleyDocument,
  offset: number
): { name: WardleyName; idOnly: boolean } | undefined {
  for (const n of doc.children) {
    if (!inside(offset, n.range)) continue;
    const name = referencesOf(n).find((r) => inside(offset, r.range));
    return name && { name, idOnly: n.type === 'Evolve' || n.type === 'Pipeline' };
  }
  return undefined;
}

function coordinateHover(doc: DocumentView<WardleyDocument>, offset: number): Hover | undefined {
  for (const n of doc.result.ast.children) {
    if (!inside(offset, n.range)) continue;
    for (const { axis, number } of coordinatesOf(n)) {
      if (!inside(offset, number.range)) continue;
      const { percent, fraction, inRange } = toPercent(number.value);
      let how = 'a value above 1 is a percentage (`1.0` is 100 %)';
      if (!inRange) how = 'a value above 100 is out of range, and the map draws it at 100 %';
      else if (fraction) how = 'a value up to 1 is a fraction of it';
      const written = doc.text.slice(number.range.start, number.range.end);
      const contents = `**${axis}** ${code(written)}\n\n${showPercent(percent)} of the axis: ${how}.`;
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
  const ref = referenceAt(doc.result.ast, at.offset);
  if (at.symbol?.kind === 'node') {
    // A part of a pipeline component's id (`Kettle_Gas`) is a name, not an id.
    const idOnly = ref?.idOnly === true && ref.name.value === at.symbol.name;
    return { range: at.symbol.range, contents: nodeHover(at.symbol.name, doc, idOnly) };
  }
  // A reference to a name no anchor or component has has no symbol (D427): still described.
  if (ref) return { range: ref.name.range, contents: nodeHover(ref.name.value, doc, ref.idOnly) };
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
