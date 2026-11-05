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

const isBlank = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

function symbolTokens(list: readonly Occurrence[]): SemanticToken[] {
  const groups = new Map<string, Occurrence[]>();
  for (const o of list) {
    const key = `${o.space}\0${o.name}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(o);
  }
  const defs = new Map<string, Occurrence | undefined>();
  for (const [key, g] of groups) defs.set(key, definitionOf(g));
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
    const range = { start: o.range.start - q, end: o.range.end + q };
    const last = out[out.length - 1];
    if (last && last.range.end > range.start) continue;
    // Typed by what the name denotes: an edge to a subgraph id is a subgraph.
    out.push({ range, type: BY_SYMBOL[(def ?? o).kind] ?? 'variable', modifiers });
  }
  return out;
}

/** Comments and directives of a document with no facet. */
function genericTokens(ctx: DocumentContext): SemanticToken[] {
  const { text, pre } = ctx;
  const out: SemanticToken[] = pre.directives.map((d) => ({
    range: d.range,
    type: 'macro' as const,
    modifiers: [],
  }));
  const comment = /^[ \t]*(%%(?!\{)[^\r\n]*)/gm;
  comment.lastIndex = pre.bodyStart;
  for (let m = comment.exec(text); m; m = comment.exec(text)) {
    const start = m.index + m[0].length - (m[1]?.length ?? 0);
    const range = { start, end: m.index + m[0].length };
    if (!pre.directives.some((d) => d.range.start < range.end && range.start < d.range.end))
      out.push({ range, type: 'comment', modifiers: [] });
  }
  return out.sort((a, b) => a.range.start - b.range.start);
}

export function semanticTokens(ctx: DocumentContext, list: readonly Occurrence[]): SemanticToken[] {
  const { result, facet, text } = ctx;
  const tokens = result?.tokens;
  if (!facet || !tokens) return genericTokens(ctx);
  const symbols = symbolTokens(list);
  const out: SemanticToken[] = [];
  /** Push `[start, end)` without its surrounding blanks. */
  const push = (from: number, to: number, type: SemanticTokenType) => {
    let start = from;
    let end = to;
    while (start < end && isBlank(text.charAt(start))) start++;
    while (end > start && isBlank(text.charAt(end - 1))) end--;
    if (start < end) out.push({ range: { start, end }, type, modifiers: [] });
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
