/**
 * Semantic tokens (D94): the parse's tokens × the facet's kind → category table, mapped to LSP
 * standard token types. Symbol occurrences replace the tokens under them with `node`,
 * `subgraph` or `class`, with `declaration` on a `def` and `definition` on the defining one.
 * Without a facet only comments and directives are marked.
 */
import type { Range, TokenCategory } from '@mermaid-js/core/parser-kit';
import type { DocumentContext } from './context.ts';
import { definitionOf } from './symbols.ts';
import type { Occurrence } from './symbols.ts';

/** The legend: LSP standard types, plus `node` and `subgraph`; then the modifiers. */
export const SEMANTIC_TOKEN_LEGEND = {
  types: [
    'keyword',
    'string',
    'operator',
    'number',
    'comment',
    'variable',
    'enumMember',
    'macro',
    'function',
    'node',
    'subgraph',
    'class',
  ],
  modifiers: ['declaration', 'definition'],
} as const;

export type SemanticTokenType = (typeof SEMANTIC_TOKEN_LEGEND.types)[number];
export type SemanticTokenModifier = (typeof SEMANTIC_TOKEN_LEGEND.modifiers)[number];

/**
 * One token. Its range can span lines (a multi-line label, an `accDescr { }` body, a `@{ }`
 * block); an LSP host without multi-line token support splits it per line.
 */
export interface SemanticToken {
  range: Range;
  type: SemanticTokenType;
  modifiers: SemanticTokenModifier[];
}

/** Token type of each highlight category; `Other` is not marked. */
const BY_CATEGORY: Readonly<Record<TokenCategory, SemanticTokenType | undefined>> = {
  Keyword: 'keyword',
  String: 'string',
  Operator: 'operator',
  Number: 'number',
  Comment: 'comment',
  Punctuation: 'operator',
  Variable: 'variable',
  Constant: 'enumMember',
  Meta: 'macro',
  Function: 'function',
  Other: undefined,
};

/** Token type of a symbol kind. */
const BY_SYMBOL: Readonly<Record<string, SemanticTokenType>> = {
  node: 'node',
  subgraph: 'subgraph',
  class: 'class',
};

/** The modifiers of a token that has none: one frozen array, so 13k tokens do not each freeze one. */
const NONE: SemanticTokenModifier[] = Object.freeze([]) as unknown as SemanticTokenModifier[];

const isBlank = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

function symbolTokens(list: readonly Occurrence[], declaredOnly: boolean): SemanticToken[] {
  const groups = new Map<string, Occurrence[]>();
  for (const o of list) {
    const key = `${o.space}\0${o.name}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(o);
  }
  const defs = new Map<string, Occurrence | undefined>();
  for (const [key, g] of groups) defs.set(key, definitionOf(g, declaredOnly));
  const out: SemanticToken[] = [];
  for (const o of list) {
    const def = defs.get(`${o.space}\0${o.name}`);
    const modifiers: SemanticTokenModifier[] = [];
    // A node mention that only names a subgraph declares nothing.
    if (o.role === 'def' && (def === undefined || def.kind === o.kind))
      modifiers.push('declaration');
    if (def === o) modifiers.push('definition');
    // A quoted name is one token with its quotes, as the lexer has it (#199).
    const q = o.quote?.length ?? 0;
    const range = q === 0 ? o.range : { start: o.range.start - q, end: o.range.end + q };
    const last = out[out.length - 1];
    if (last && last.range.end > range.start) continue;
    // Typed by what the name denotes: an edge to a subgraph id is a subgraph.
    out.push({ range, type: BY_SYMBOL[(def ?? o).kind] ?? 'variable', modifiers });
  }
  return out;
}

/** Comments and directives that start in `[from, to)`, in order. */
function triviaTokens(ctx: DocumentContext, from: number, to: number): SemanticToken[] {
  const { text, pre } = ctx;
  const out: SemanticToken[] = pre.directives
    .filter((d) => d.range.start >= from && d.range.start < to)
    .map((d) => ({ range: d.range, type: 'macro' as const, modifiers: [] }));
  const comment = /^[ \t]*(%%(?!\{)[^\r\n]*)/gm;
  comment.lastIndex = from;
  for (let m = comment.exec(text); m && m.index < to; m = comment.exec(text)) {
    const start = m.index + m[0].length - (m[1]?.length ?? 0);
    const range = { start, end: m.index + m[0].length };
    if (!pre.directives.some((d) => d.range.start < range.end && range.start < d.range.end))
      out.push({ range, type: 'comment', modifiers: [] });
  }
  return out.sort((a, b) => a.range.start - b.range.start);
}

/**
 * Where the front matter's opening fence is, or 0. A fence that is not closed yet (the author is
 * typing it) has no front matter; its `UNCLOSED_FRONT_MATTER` error points at the fence.
 */
function fenceStart({ pre }: DocumentContext): number {
  const unclosed = pre.diagnostics.find((d) => d.code === 'UNCLOSED_FRONT_MATTER');
  return pre.frontMatter?.range.start ?? unclosed?.related?.[0]?.range.start ?? 0;
}

/** The `%%` lines above the front matter (D704), which no lexer reads. */
const headTokens = (ctx: DocumentContext): SemanticToken[] => triviaTokens(ctx, 0, fenceStart(ctx));

/** Comments and directives of a document with no facet. */
function genericTokens(ctx: DocumentContext): SemanticToken[] {
  return [...headTokens(ctx), ...triviaTokens(ctx, ctx.pre.bodyStart, Infinity)];
}

export function semanticTokens(ctx: DocumentContext, list: readonly Occurrence[]): SemanticToken[] {
  const { result, facet, text } = ctx;
  const tokens = result?.tokens;
  if (!facet || !tokens) return genericTokens(ctx);
  const symbols = symbolTokens(list, facet.declaredOnly === true);
  const out: SemanticToken[] = headTokens(ctx);
  /** Push `[start, end)` without its surrounding blanks. */
  const push = (from: number, to: number, type: SemanticTokenType) => {
    let start = from;
    let end = to;
    while (start < end && isBlank(text.charAt(start))) start++;
    while (end > start && isBlank(text.charAt(end - 1))) end--;
    if (start < end) out.push({ range: { start, end }, type, modifiers: NONE });
  };
  let j = 0;
  // Out is in order and disjoint (LSP needs it): `done` is the end of the last symbol put in.
  let done = 0;
  for (let i = 0; i < tokens.length; i++) {
    const type = BY_CATEGORY[facet.categories[tokens.kind[i] ?? 0] ?? 'Other'];
    if (type === undefined) continue;
    // A symbol can span lexer tokens (`default-index.js`): the rest of it is not re-typed.
    let at = Math.max(tokens.start[i] ?? 0, done);
    // A token ends where the next one starts (`end` takes the blanks and comment after it).
    const end = Math.min(tokens.end[i] ?? 0, tokens.start[i + 1] ?? Infinity);
    // Symbols before or inside this token go in at their place; the token keeps the rest
    // (a token can hold more text than its symbol).
    while (j < symbols.length && symbols[j]!.range.start < end) {
      const s = symbols[j++]!;
      if (s.range.start > at) push(at, s.range.start, type);
      out.push(s);
      at = Math.max(at, s.range.end);
      done = Math.max(done, s.range.end);
    }
    push(at, end, type);
  }
  while (j < symbols.length) out.push(symbols[j++]!);
  return out;
}

/** A block's body (ADR-15) and its own tokens, ranges inside the body. */
export interface BlockTokens {
  /** Where the block body is in the outer text, as written. */
  readonly offset: number;
  readonly length: number;
  /** The block's tokens, in its own document's text (D633: without the body's indentation). */
  readonly tokens: readonly SemanticToken[];
  /** Where offset `at` of the block's document text is in the outer text. */
  readonly outer: (at: number) => number;
}

/**
 * `host`'s tokens with each block body's (one opaque host token) replaced by the block's own
 * tokens, moved to the outer text; still sorted and disjoint.
 */
export function withBlockTokens(
  host: readonly SemanticToken[],
  blocks: readonly BlockTokens[]
): SemanticToken[] {
  if (blocks.length === 0) return host as SemanticToken[];
  const out: SemanticToken[] = [];
  let i = 0;
  for (const { offset, length, tokens, outer } of blocks) {
    while (i < host.length && host[i]!.range.start < offset) out.push(host[i++]!);
    while (i < host.length && host[i]!.range.start < offset + length) i++;
    for (const t of tokens) {
      const range = { start: outer(t.range.start), end: outer(t.range.end) };
      out.push({ range, type: t.type, modifiers: t.modifiers });
    }
  }
  while (i < host.length) out.push(host[i++]!);
  return out;
}
