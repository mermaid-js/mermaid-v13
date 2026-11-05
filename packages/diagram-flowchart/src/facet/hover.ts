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
  Range,
  SymbolOccurrence,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { flowchartDocs } from '../generated/docs.ts';
import type { FlowDocument, FlowEdge, FlowNodeStmt, FlowStatementNode } from '../parser/ast.ts';
import type { FlowModel } from '../parser/model.ts';
import { destructLink } from '../parser/model.ts';
import { acceptedShape, SHAPE_GROUPS } from '../parser/shapes.ts';
import { T } from '../parser/tokens.ts';
import { code, describeLink, DIRECTIONS, span, tokenBefore } from './tables.ts';

const LINK_TOKENS = new Set<number>([T.Link, T.StartLink]);

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

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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

function classHover(name: string, model: FlowModel): string {
  const c = model.classes.find((x) => x.id === name);
  const used =
    name === 'default'
      ? 'Applies to every node without a class.'
      : `Used by ${plural(model.vertices.filter((v) => v.classes.includes(name)).length, 'node')}`;
  let styles = 'No `classDef` defines it.';
  if (c !== undefined) {
    styles =
      c.styles.length === 0
        ? 'Its `classDef` sets no styles.'
        : code(`classDef ${name} ${c.styles.join(',')}`);
  }
  return `**class** ${code(name)}\n\n${styles}\n\n${used}`;
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
      return classHover(s.name, model);
    case 'edge':
      return edgeHover(s.name, model);
    default:
      return undefined;
  }
}

/** A range without its leading and trailing blanks. */
function trimmed(text: string, r: Range): Range {
  let { start, end } = r;
  while (start < end && /\s/.test(text[start]!)) start++;
  while (end > start && /\s/.test(text[end - 1]!)) end--;
  return span(start, end);
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

function shapeHover(text: string, token: Range, at: number): Hover | undefined {
  const body = text.slice(token.start, token.end);
  for (const m of body.matchAll(/(?:^|[\s,{])shape\s*:\s*([\w-]+)/g)) {
    const name = m[1]!;
    const start = token.start + m.index + m[0].length - name.length;
    if (at < start || at > start + name.length || !acceptedShape(name)) continue;
    const group = SHAPE_GROUPS.find((g) => g.includes(name));
    const names = group
      ? `Names: ${group.filter(acceptedShape).map(code).join(', ')}`
      : 'A shape v12 accepts by name; not in its shape documentation.';
    const same = group && group[0] !== name ? ` (same as ${code(group[0]!)})` : '';
    return {
      range: span(start, start + name.length),
      contents: `**${code(name)}** shape${same}\n\n${names}`,
    };
  }
  return undefined;
}

/** Keywords the lexer emits no token for, and the kind of the token they come before. */
const BARE_KEYWORDS: Readonly<Record<string, number>> = { call: T.CallbackName };

/** `call` under the cursor: the doc of the token right after it. */
function bareKeyword(text: string, tokens: TokenStream | undefined, at: number): Hover | undefined {
  if (!tokens) return undefined;
  let start = at;
  let end = at;
  while (start > 0 && start > at - 5 && /[a-z]/.test(text.charAt(start - 1))) start--;
  while (end < text.length && end < at + 5 && /[a-z]/.test(text.charAt(end))) end++;
  const kind = BARE_KEYWORDS[text.slice(start, end)];
  if (kind === undefined || (start > 0 && /\w/.test(text.charAt(start - 1)))) return undefined;
  // The next token after the keyword and its blanks must be the one it introduces.
  let next = end;
  while (next < text.length && /[^\S\r\n]/.test(text.charAt(next))) next++;
  const i = tokenBefore(tokens, next);
  if (i < 0 || tokens.start[i] !== next || tokens.kind[i] !== kind) return undefined;
  const doc = flowchartDocs[kind];
  return doc === undefined
    ? undefined
    : { range: span(start, end), contents: `**${code(text.slice(start, end))}**\n\n${doc}` };
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
  if (!t) return bareKeyword(text, result.tokens, at.offset);
  if (t.kind === T.ShapeData) return shapeHover(text, t.range, at.offset);
  // Tokens may take blanks and line breaks with them (`end`, links): only their text counts.
  const range = trimmed(text, t.range);
  if (at.offset < range.start || at.offset > range.end || range.start === range.end) {
    return undefined;
  }
  const word = text.slice(range.start, range.end);
  if (LINK_TOKENS.has(t.kind)) {
    const h = linkHover(text, at.offset, model, result.ast);
    if (h) return h;
    const { type, stroke, length } = destructLink(word);
    if (type === 'INVALID') return undefined;
    const what = describeLink(type, stroke, length);
    return { range, contents: `**${code(word)}** ${what}\n\n${flowchartDocs[T.Link]}` };
  }
  if (t.kind === T.Dir) {
    const meaning = DIRECTIONS.find(([d]) => d === model.direction)?.[1] ?? model.direction;
    const as = word === model.direction ? '' : ` (${code(model.direction)})`;
    return { range, contents: `**${code(word)}** direction: ${meaning}${as}` };
  }
  const docText = flowchartDocs[t.kind];
  if (docText === undefined) return undefined;
  return { range, contents: `**${code(word)}**\n\n${docText}` };
}
