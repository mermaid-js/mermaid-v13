/**
 * Agentflow hover (DESIGN §4.5, D93), on the flow family's pieces
 * (`@mermaid-js/shared/parser/flow-facet`, shared with flowchart, D467): a node id shows
 * its kind (`task`, `tool`, …, `connector`), label, drawn shape, flow, classes, metadata and edge
 * counts; a flow id its title, members, view and metadata; a class its `classDef` styles; an
 * edge id its ends and semantic; a link its semantic; a keyword the one-line doc of the grammar
 * file (`generated/docs.ts`); a name in `@{ shape: … }` the kind it gives and how it is drawn.
 * Never a preview.
 */
import type {
  DocumentView,
  Hover,
  HoverTarget,
  SymbolOccurrence,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { code, plural, span, trimmed } from '@mermaid-js/shared/parser/facet';
import {
  flowBareKeywordHover,
  flowClassHover,
  flowShapeHover,
  flowTokenHover,
} from '@mermaid-js/shared/parser/flow-facet';
import { agentflowDocs } from '../generated/docs.ts';
import type {
  AgentflowDocument,
  AgentflowEdge,
  AgentflowNodeStmt,
  AgentflowStatementNode,
} from '../parser/ast.ts';
import type { AgentflowFlowModel, AgentflowModel } from '../parser/model.ts';
import { destructLink } from '../parser/model.ts';
import { T } from '../parser/tokens.ts';
import { describeLink, shapeText } from './tables.ts';

const DOCS = { kinds: T, docs: agentflowDocs };

/** Every node mention and edge of the AST, in source order, flows and globals included. */
function* chainParts(
  children: readonly AgentflowStatementNode[]
): Generator<AgentflowNodeStmt | AgentflowEdge> {
  for (const c of children) {
    if (c.type === 'Chain') yield* c.children;
    else if (c.type === 'Flow' || c.type === 'Global') yield* chainParts(c.children);
  }
}

/** A metadata value as a short text: strings as written, the rest as JSON. */
function valueText(value: unknown): string {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
}

/** `Metadata: `key: value`, …`, or nothing for no metadata. */
function metadataLine(metadata: Readonly<Record<string, unknown>> | undefined): string[] {
  const entries = Object.entries(metadata ?? {});
  if (entries.length === 0) return [];
  return [`Metadata: ${entries.map(([k, v]) => code(`${k}: ${valueText(v)}`)).join(', ')}`];
}

function edgeCounts(name: string, model: AgentflowModel): string {
  let into = 0;
  let out = 0;
  for (const e of model.edges) {
    if (e.end === name) into++;
    if (e.start === name) out++;
  }
  return `Edges: ${into} in, ${out} out`;
}

/** The flow a vertex or flow is written in, and the collapsed flow it is drawn in, if any. */
function placeFacts(parent: string | undefined, collapsedInto: string | undefined): string[] {
  const facts: string[] = [];
  if (parent !== undefined) facts.push(`In flow ${code(parent)}`);
  if (collapsedInto !== undefined) facts.push(`drawn in the collapsed ${code(collapsedInto)}`);
  return facts;
}

function nodeHover(
  name: string,
  model: AgentflowModel,
  ast: AgentflowDocument
): string | undefined {
  const v = model.vertices.find((x) => x.id === name);
  if (!v) return undefined;
  const labels = [v.text];
  for (const p of chainParts(ast.children)) {
    if (p.type !== 'Node' || p.name !== name || !p.label) continue;
    const l = p.label.text.trim().replace(/^"(.*)"$/s, '$1');
    if (!labels.includes(l)) labels.push(l);
  }
  let what = labels.length === 1 ? 'Label' : 'Labels';
  if (v.connector) what = 'Title';
  const facts = [`${what}: ${labels.map(code).join(', ')}`];
  if (!v.connector) facts.push(`Shape: ${code(v.shape)}`);
  const classes = [...new Set(v.classes)];
  if (classes.length > 0) {
    facts.push(`${classes.length === 1 ? 'Class' : 'Classes'}: ${classes.map(code).join(', ')}`);
  }
  const lines = [`**${v.kind}** ${code(name)}`, facts.join(' · ')];
  const place = placeFacts(v.parent, v.collapsedInto);
  if (place.length > 0) lines.push(place.join(', '));
  lines.push(...metadataLine(v.metadata), edgeCounts(name, model));
  return lines.join('\n\n');
}

function flowHover(flow: AgentflowFlowModel, model: AgentflowModel): string {
  const facts = [
    ...(flow.title === '' ? [] : [`Title: ${code(flow.title)}`]),
    plural(flow.nodes.length, 'member'),
    flow.collapsed ? 'collapsed' : 'expanded',
  ];
  if (flow.dir !== undefined) facts.push(`direction ${code(flow.dir)}`);
  const lines = [`**flow** ${code(flow.id)}`, facts.join(' · ')];
  const place = placeFacts(flow.parent, flow.collapsedInto);
  if (place.length > 0) lines.push(place.join(', '));
  lines.push(...metadataLine(flow.metadata), edgeCounts(flow.id, model));
  return lines.join('\n\n');
}

function edgeHover(name: string, model: AgentflowModel): string | undefined {
  const e = model.edges.find((x) => x.id === name);
  if (!e) return undefined;
  return `**edge** ${code(name)}\n\n${code(e.start)} → ${code(e.end)}: ${describeLink(e.semantic)}`;
}

function symbolHover(
  s: SymbolOccurrence,
  model: AgentflowModel,
  ast: AgentflowDocument
): string | undefined {
  switch (s.kind) {
    case 'node':
    case 'subgraph': {
      const flow = model.flows.find((f) => f.id === s.name);
      return flow ? flowHover(flow, model) : nodeHover(s.name, model, ast);
    }
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
  model: AgentflowModel,
  ast: AgentflowDocument
): Hover | undefined {
  for (const p of chainParts(ast.children)) {
    if (p.type !== 'Edge' || p.linkRange.start > at || at >= p.linkRange.end) continue;
    const e = model.edges.find((x) => x.id === p.edgeId);
    if (!e) break;
    const range = trimmed(text, p.linkRange);
    const arrow = text.slice(range.start, range.end);
    const ends = `${code(e.start)} → ${code(e.end)}`;
    const what = `**${code(arrow)}** ${describeLink(e.semantic)}`;
    return { range, contents: `${what}\n\n${ends}\n\n${agentflowDocs[T.Link]}` };
  }
  return undefined;
}

/**
 * `accDescr {` and its `}`: the lexer gives them no token of their own (the opener and the
 * closer attach to the description), so they are found around each description token. They
 * show the doc `accDescr:` shows.
 */
function accDescrBlock(
  text: string,
  tokens: TokenStream | undefined,
  at: number
): Hover | undefined {
  if (!tokens) return undefined;
  const doc = agentflowDocs[T.AccDescr];
  if (doc === undefined) return undefined;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens.kind[i] !== T.AccDescrMultilineValue) continue;
    const start = tokens.start[i] ?? 0;
    const end = tokens.end[i] ?? 0;
    const opener = /accDescr\s*\{\s*$/.exec(text.slice(Math.max(0, start - 256), start));
    if (opener) {
      const from = start - opener[0].length;
      const brace = text.indexOf('{', from) + 1;
      if (from <= at && at <= brace)
        return { range: span(from, brace), contents: `**\`accDescr {\`**\n\n${doc}` };
    }
    if (text.charAt(end) === '}' && (at === end || at === end + 1))
      return { range: span(end, end + 1), contents: `**\`}\`** closes \`accDescr {\`\n\n${doc}` };
  }
  return undefined;
}

export function agentflowHover(
  at: HoverTarget,
  doc: DocumentView<AgentflowDocument>
): Hover | undefined {
  const { text, result } = doc;
  const model = result.model as AgentflowModel;
  if (at.symbol) {
    const contents = symbolHover(at.symbol, model, result.ast);
    if (contents !== undefined) return { range: at.symbol.range, contents };
  }
  const t = at.token;
  if (!t || t.kind === T.AccDescrMultilineValue) {
    const block = accDescrBlock(text, result.tokens, at.offset);
    if (block || t) return block;
    return flowBareKeywordHover(text, result.tokens, at.offset, DOCS);
  }
  if (t.kind === T.ShapeData) {
    return flowShapeHover(
      text,
      t.range,
      at.offset,
      (name) => `**${code(name)}** shape\n\n${shapeText(name)}`
    );
  }
  return flowTokenHover(text, at.offset, t, model.direction, {
    ...DOCS,
    link: (range, word) => {
      const h = linkHover(text, at.offset, model, result.ast);
      if (h) return h;
      const { type, semantic } = destructLink(word);
      if (type === 'INVALID') return undefined;
      return {
        range,
        contents: `**${code(word)}** ${describeLink(semantic)}\n\n${agentflowDocs[T.Link]}`,
      };
    },
  });
}
