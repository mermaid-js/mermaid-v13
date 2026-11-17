/**
 * Flowchart hover (DESIGN §4.5, D93): a node id shows its label(s), shape, classes and edge
 * counts; a subgraph id its title and member count; a class its `classDef` styles; an edge id
 * its ends; a keyword or arrow the one-line doc of the grammar file (`generated/docs.ts`); a
 * shape name in `@{ shape: … }` its other names. Never a preview.
 */
import type {
  DocumentView,
  Hover,
  HoverTarget,
  SymbolOccurrence,
} from '@mermaid-js/core/parser-kit';
import { code, plural, symbolHoverOf } from '@mermaid-js/shared/parser/facet';
import {
  flowBareKeywordHover,
  flowClassesFact,
  flowClassHover,
  flowEdgeCounts,
  flowLinkAt,
  flowNodeLabels,
  flowShapeHover,
  flowTokenHover,
} from '@mermaid-js/shared/parser/flow-facet';
import { flowchartDocs } from '../generated/docs.ts';
import type { FlowDocument, FlowEdge, FlowNodeStmt, FlowStatementNode } from '../parser/ast.ts';
import type { FlowModel } from '../parser/model.ts';
import { destructLink } from '../parser/model.ts';
import { acceptedShape, SHAPE_GROUPS } from '../parser/shapes.ts';
import { T } from '../parser/tokens.ts';
import { describeLink } from './tables.ts';

const DOCS = { kinds: T, docs: flowchartDocs };

/** Every node mention and edge of the AST, in source order. */
function* chainParts(children: readonly FlowStatementNode[]): Generator<FlowNodeStmt | FlowEdge> {
  for (const c of children) {
    if (c.type === 'Chain') yield* c.children;
    else if (c.type === 'Subgraph') yield* chainParts(c.children);
  }
}

function nodeHover(name: string, model: FlowModel, ast: FlowDocument): string | undefined {
  const v = model.vertices.find((x) => x.id === name);
  if (!v) return undefined;
  const labels = flowNodeLabels(name, v.text, chainParts(ast.children));
  const facts = [
    `${labels.length === 1 ? 'Label' : 'Labels'}: ${labels.map(code).join(', ')}`,
    `Shape: ${v.type === undefined ? 'default' : code(v.type)}`,
    ...flowClassesFact(v.classes),
  ];
  return `**node** ${code(name)}\n\n${facts.join(' · ')}\n\n${flowEdgeCounts(name, model.edges)}`;
}

function subgraphHover(name: string, model: FlowModel): string | undefined {
  const s = model.subgraphs.find((x) => x.id === name);
  if (!s) return undefined;
  return `**subgraph** ${code(name)}\n\nTitle: ${code(s.title)} · ${plural(s.nodes.length, 'member')}`;
}

function edgeHover(name: string, model: FlowModel): string | undefined {
  const e = model.edges.find((x) => x.id === name);
  if (!e) return undefined;
  const what = describeLink(e.type, e.stroke, e.length);
  return `**edge** ${code(name)}\n\n${code(e.start)} → ${code(e.end)}: ${what}`;
}

function symbolHover(s: SymbolOccurrence, model: FlowModel, ast: FlowDocument): string | undefined {
  switch (s.kind) {
    case 'node':
    case 'subgraph':
      return subgraphHover(s.name, model) ?? nodeHover(s.name, model, ast);
    case 'class':
      return flowClassHover(s.name, model);
    case 'edge':
      return edgeHover(s.name, model);
    default:
      return undefined;
  }
}

function linkHover(
  text: string,
  at: number,
  model: FlowModel,
  ast: FlowDocument
): Hover | undefined {
  const link = flowLinkAt(text, chainParts(ast.children), at);
  const e = link && model.edges.find((x) => x.id === link.edgeId);
  if (!link || !e) return undefined;
  const what = describeLink(e.type, e.stroke, e.length);
  return {
    range: link.range,
    contents: `**${code(link.arrow)}** ${what}\n\n${flowchartDocs[T.Link]}`,
  };
}

/** A shape name in `@{ shape: … }`: its other names. One v12 does not accept shows nothing. */
function shapeText(name: string): string | undefined {
  if (!acceptedShape(name)) return undefined;
  const group = SHAPE_GROUPS.find((g) => g.includes(name));
  const names = group
    ? `Names: ${group.filter(acceptedShape).map(code).join(', ')}`
    : 'A shape v12 accepts by name; not in its shape documentation.';
  const same = group && group[0] !== name ? ` (same as ${code(group[0]!)})` : '';
  return `**${code(name)}** shape${same}\n\n${names}`;
}

export function flowchartHover(
  at: HoverTarget,
  doc: DocumentView<FlowDocument>
): Hover | undefined {
  const { text, result } = doc;
  const model = result.model as FlowModel;
  const symbol = symbolHoverOf(at, (s) => symbolHover(s, model, result.ast));
  if (symbol) return symbol;
  const t = at.token;
  if (!t) return flowBareKeywordHover(text, result.tokens, at.offset, DOCS);
  if (t.kind === T.ShapeData) return flowShapeHover(text, t.range, at.offset, shapeText);
  return flowTokenHover(text, at.offset, t, model.direction, {
    ...DOCS,
    link: (range, word) => {
      const h = linkHover(text, at.offset, model, result.ast);
      if (h) return h;
      const { type, stroke, length } = destructLink(word);
      if (type === 'INVALID') return undefined;
      const what = describeLink(type, stroke, length);
      return { range, contents: `**${code(word)}** ${what}\n\n${flowchartDocs[T.Link]}` };
    },
  });
}
