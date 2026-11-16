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
import { code, plural, trimmed } from '@mermaid-js/shared/parser/facet';
import {
  flowBareKeywordHover,
  flowClassHover,
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

const unquote = (s: string) => {
  const t = s.trim();
  return t.length > 1 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
};

function nodeHover(name: string, model: FlowModel, ast: FlowDocument): string | undefined {
  const v = model.vertices.find((x) => x.id === name);
  if (!v) return undefined;
  const labels = [v.text];
  for (const p of chainParts(ast.children)) {
    if (p.type !== 'Node' || p.name !== name || !p.label) continue;
    const l = unquote(p.label.text);
    if (!labels.includes(l)) labels.push(l);
  }
  let into = 0;
  let out = 0;
  for (const e of model.edges) {
    if (e.end === name) into++;
    if (e.start === name) out++;
  }
  const facts = [
    `${labels.length === 1 ? 'Label' : 'Labels'}: ${labels.map(code).join(', ')}`,
    `Shape: ${v.type === undefined ? 'default' : code(v.type)}`,
  ];
  const classes = [...new Set(v.classes)];
  if (classes.length > 0) {
    facts.push(`${classes.length === 1 ? 'Class' : 'Classes'}: ${classes.map(code).join(', ')}`);
  }
  return `**node** ${code(name)}\n\n${facts.join(' · ')}\n\nEdges: ${into} in, ${out} out`;
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
  for (const p of chainParts(ast.children)) {
    if (p.type !== 'Edge' || p.linkRange.start > at || at >= p.linkRange.end) continue;
    const e = model.edges.find((x) => x.id === p.edgeId);
    if (!e) break;
    const range = trimmed(text, p.linkRange);
    const arrow = text.slice(range.start, range.end);
    const what = describeLink(e.type, e.stroke, e.length);
    return { range, contents: `**${code(arrow)}** ${what}\n\n${flowchartDocs[T.Link]}` };
  }
  return undefined;
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
  if (at.symbol) {
    const contents = symbolHover(at.symbol, model, result.ast);
    if (contents !== undefined) return { range: at.symbol.range, contents };
  }
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
