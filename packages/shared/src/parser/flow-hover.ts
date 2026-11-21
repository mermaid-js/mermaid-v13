/**
 * The flow family's hover pieces (DESIGN §4.5, D93): what a class shows, a keyword the lexer
 * emits no token for, a shape name inside `@{ shape: … }`, and a token (an arrow, the header's
 * direction, a keyword with its one-line doc). A diagram's hover puts them together with what
 * its own ids show.
 */
import type { Hover, Range, TokenStream } from '@mermaid-js/core/parser-kit';
import { classDefHover, code, covers, plural, span, tokenBefore, trimmed } from './facet.ts';
import { FLOW_DIRECTION_DOCS } from './flow-facet-tables.ts';
import type { FlowEdge, FlowNodeStmt } from './flow-ast.ts';
import type { FlowKinds } from './flow-kinds.ts';

/**
 * The labels node `name` is written with: `first` (the model's), then each other label of its
 * mentions among `parts`, unquoted, once each.
 */
export function flowNodeLabels(
  name: string,
  first: string,
  parts: Iterable<FlowNodeStmt | FlowEdge>
): string[] {
  const labels = [first];
  for (const p of parts) {
    if (p.type !== 'Node' || p.name !== name || !p.label) continue;
    const t = p.label.text.trim();
    const l = t.length > 1 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
    if (!labels.includes(l)) labels.push(l);
  }
  return labels;
}

/** `Class: a` or `Classes: a, b`, each class once; nothing for none. */
export function flowClassesFact(classes: readonly string[]): string[] {
  const once = [...new Set(classes)];
  if (once.length === 0) return [];
  return [`${once.length === 1 ? 'Class' : 'Classes'}: ${once.map(code).join(', ')}`];
}

/** `Edges: 2 in, 1 out`: the edges of `edges` that end and start at node `name`. */
export function flowEdgeCounts(
  name: string,
  edges: readonly { readonly start: string; readonly end: string }[]
): string {
  let into = 0;
  let out = 0;
  for (const e of edges) {
    if (e.end === name) into++;
    if (e.start === name) out++;
  }
  return `Edges: ${into} in, ${out} out`;
}

/**
 * The first edge among `parts` whose link holds `at` (its start included, its end not): the
 * model edge id, and the link's range and text without its blanks.
 */
export function flowLinkAt(
  text: string,
  parts: Iterable<FlowNodeStmt | FlowEdge>,
  at: number
): { edgeId: string; range: Range; arrow: string } | undefined {
  for (const p of parts) {
    if (p.type !== 'Edge' || p.linkRange.start > at || at >= p.linkRange.end) continue;
    const range = trimmed(text, p.linkRange);
    return { edgeId: p.edgeId, range, arrow: text.slice(range.start, range.end) };
  }
  return undefined;
}

/** What a class hover reads of a model. */
export interface ClassesModel {
  readonly classes: readonly { readonly id: string; readonly styles: readonly string[] }[];
  readonly vertices: readonly { readonly classes: readonly string[] }[];
}

/** A class: its `classDef` styles and how many nodes use it. */
export function flowClassHover(name: string, model: ClassesModel): string {
  const c = model.classes.find((x) => x.id === name);
  const used =
    name === 'default'
      ? 'Applies to every node without a class.'
      : `Used by ${plural(model.vertices.filter((v) => v.classes.includes(name)).length, 'node')}`;
  return classDefHover('class', name, c?.styles, used);
}

/**
 * `call` under the cursor: the doc of the token right after it. The lexer emits no token for
 * the keyword; the callback name it comes before has the doc.
 */
export function flowBareKeywordHover(
  text: string,
  tokens: TokenStream | undefined,
  at: number,
  dialect: { kinds: FlowKinds; docs: Readonly<Partial<Record<number, string>>> }
): Hover | undefined {
  if (!tokens) return undefined;
  let start = at;
  let end = at;
  while (start > 0 && start > at - 5 && /[a-z]/.test(text.charAt(start - 1))) start--;
  while (end < text.length && end < at + 5 && /[a-z]/.test(text.charAt(end))) end++;
  if (text.slice(start, end) !== 'call' || (start > 0 && /\w/.test(text.charAt(start - 1))))
    return undefined;
  const kind = dialect.kinds.CallbackName;
  // The next token after the keyword and its blanks must be the one it introduces.
  let next = end;
  while (next < text.length && /[^\S\r\n]/.test(text.charAt(next))) next++;
  const i = tokenBefore(tokens, next);
  if (i < 0 || tokens.start[i] !== next || tokens.kind[i] !== kind) return undefined;
  const doc = dialect.docs[kind];
  return doc === undefined
    ? undefined
    : { range: span(start, end), contents: `**${code(text.slice(start, end))}**\n\n${doc}` };
}

/**
 * The shape name under `at` in the `@{ … }` token `token`, after a `shape:` key: the hover
 * `describe` gives for it. A name `describe` has nothing to say of is passed over.
 */
export function flowShapeHover(
  text: string,
  token: Range,
  at: number,
  describe: (name: string) => string | undefined
): Hover | undefined {
  const body = text.slice(token.start, token.end);
  for (const m of body.matchAll(/(?:^|[\s,{])shape\s*:\s*([\w-]+)/g)) {
    const name = m[1] ?? '';
    const start = token.start + m.index + m[0].length - name.length;
    if (at < start || at > start + name.length) continue;
    const contents = describe(name);
    if (contents === undefined) continue;
    return { range: span(start, start + name.length), contents };
  }
  return undefined;
}

/** What a token hover needs of a dialect. */
export interface FlowTokenHoverDialect {
  readonly kinds: FlowKinds;
  /** Each keyword and operator kind's one-line doc (`generated/docs.ts`). */
  readonly docs: Readonly<Partial<Record<number, string>>>;
  /** The hover of the link token whose text `word` is at `range`. */
  link(range: Range, word: string): Hover | undefined;
}

/**
 * The hover of the token `token` under `offset`: a link, the header's direction (`direction`
 * is the model's), or a kind with a doc.
 */
export function flowTokenHover(
  text: string,
  offset: number,
  token: { readonly kind: number; readonly range: Range },
  direction: string,
  dialect: FlowTokenHoverDialect
): Hover | undefined {
  const T = dialect.kinds;
  // Tokens may take blanks and line breaks with them (`end`, links): only their text counts.
  const range = trimmed(text, token.range);
  if (!covers(offset, range)) return undefined;
  const word = text.slice(range.start, range.end);
  if (token.kind === T.Link || token.kind === T.StartLink) return dialect.link(range, word);
  if (token.kind === T.Dir) {
    const meaning = FLOW_DIRECTION_DOCS.find(([d]) => d === direction)?.[1] ?? direction;
    const as = word === direction ? '' : ` (${code(direction)})`;
    return { range, contents: `**${code(word)}** direction: ${meaning}${as}` };
  }
  const docText = dialect.docs[token.kind];
  if (docText === undefined) return undefined;
  return { range, contents: `**${code(word)}**\n\n${docText}` };
}
