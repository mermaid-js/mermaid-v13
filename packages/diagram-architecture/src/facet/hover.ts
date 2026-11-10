/**
 * Architecture hover (DESIGN §4.5, D93): an id, where it is declared or used, shows what it is
 * (service, junction or group, as v12 registered it), its label, icon and group; an edge,
 * anywhere but on its ids (its sides, arrow, arrowheads, label, `{group}`), shows its two ends
 * and the sides they meet, with its arrowheads and label; a keyword the one-line doc of the
 * grammar file (`generated/docs.ts`). Never a preview.
 */
import type { DocumentView, Hover, HoverTarget, Range } from '@mermaid-js/core/parser-kit';
import { architectureDocs } from '../generated/docs.ts';
import type { ArchitectureModel } from '../model.ts';
import type {
  ArchitectureDocument,
  ArchitectureEdgeEnd,
  ArchitectureEdgeNode,
} from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { code, elementOf, inside, SIDE_NAMES, span } from './tables.ts';

/** Tokens with a doc that hover leaves alone: ids and text. */
const NO_DOC = new Set<number>([T.String, T.Id, T.Icon, T.Label]);

/** `title`, `accTitle` and `accDescr` tokens hold their text: only the keyword is hovered. */
const TEXT_WORDS: Readonly<Partial<Record<number, string>>> = {
  [T.Title]: 'title',
  [T.AccTitle]: 'accTitle',
  [T.AccDescr]: 'accDescr',
};

/** What `id` is, for an edge end: its kind and the id in code, or that nothing has the id. */
function named(model: ArchitectureModel, id: string): string {
  const e = elementOf(model, id);
  return e ? `${e.kind} ${code(id)}` : `${code(id)} (no service or junction has this id)`;
}

function idHover(model: ArchitectureModel, id: string): string {
  const e = elementOf(model, id);
  if (!e) return `**id** ${code(id)}\n\nNo service, junction or group has this id.`;
  const lines = [`**${e.kind}** ${code(id)}`];
  const facts: string[] = [];
  const { element } = e;
  if ('title' in element && element.title !== undefined)
    facts.push(`Label ${code(element.title)}.`);
  if ('icon' in element && element.icon !== undefined) facts.push(`Icon ${code(element.icon)}.`);
  if ('iconText' in element && element.iconText !== undefined) {
    facts.push(`Text icon ${code(element.iconText)}.`);
  }
  facts.push(element.in === undefined ? 'In no group.' : `In group ${code(element.in)}.`);
  lines.push(facts.join(' '));
  return lines.join('\n\n');
}

/** One end of an edge in words: the side it meets and of what (the id, or its group). */
function endText(model: ArchitectureModel, end: ArchitectureEdgeEnd): string {
  const side = `the ${SIDE_NAMES[end.side]} side (${code(end.side)})`;
  const id = named(model, end.name.value);
  if (end.group === undefined) return `${side} of ${id}`;
  const parent = elementOf(model, end.name.value)?.element.in;
  // D504: `{group}` on an id in no group is ignored (with a warning).
  if (parent === undefined) return `${side} of ${id} (in no group, so \`{group}\` is ignored)`;
  return `${side} of group ${code(parent)} (around ${id})`;
}

function edgeHover(model: ArchitectureModel, edge: ArchitectureEdgeNode): string {
  const { lhs, rhs } = edge;
  const lines = [
    `**edge** ${code(lhs.name.value)} ${code(lhs.side)} – ${code(rhs.side)} ${code(rhs.name.value)}`,
    `From ${endText(model, lhs)} to ${endText(model, rhs)}.`,
  ];
  const heads = [lhs, rhs].filter((e) => e.into).map((e) => code(e.name.value));
  if (heads.length > 0) lines.push(`Arrowhead at ${heads.join(' and ')}.`);
  if (edge.label) lines.push(`Label ${code(edge.label.value)}.`);
  return lines.join('\n\n');
}

/** The edge whose text holds `offset`, off its two ids, with the range hovered. */
function edgeAt(
  doc: ArchitectureDocument,
  offset: number,
  token: Range | undefined
): { edge: ArchitectureEdgeNode; range: Range } | undefined {
  for (const n of doc.children) {
    if (n.type !== 'Edge' || !inside(offset, n.range)) continue;
    if (inside(offset, n.lhs.name.range) || inside(offset, n.rhs.name.range)) return undefined;
    return { edge: n, range: token ?? n.range };
  }
  return undefined;
}

export function architectureHover(
  at: HoverTarget,
  doc: DocumentView<ArchitectureDocument>
): Hover | undefined {
  const { text } = doc;
  // The facet's own parse: its model is an ArchitectureModel.
  const model = doc.result.model as ArchitectureModel;
  if (at.symbol) return { range: at.symbol.range, contents: idHover(model, at.symbol.name) };
  const t = at.token;
  const edge = edgeAt(doc.result.ast, at.offset, t?.range);
  if (edge) return { range: edge.range, contents: edgeHover(model, edge.edge) };
  if (!t || NO_DOC.has(t.kind)) return undefined;
  let range = t.range;
  const word = TEXT_WORDS[t.kind];
  if (word !== undefined) {
    const start =
      range.start + (/^[\t ]*/.exec(text.slice(range.start, range.end))?.[0].length ?? 0);
    range = span(start, start + word.length);
  }
  if (at.offset < range.start || at.offset > range.end) return undefined;
  const docText = architectureDocs[t.kind];
  if (docText === undefined) return undefined;
  return { range, contents: `**${code(text.slice(range.start, range.end))}**\n\n${docText}` };
}
