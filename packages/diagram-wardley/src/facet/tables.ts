/**
 * The wardley facet's completion table and shared helpers (DESIGN §4.5, D95). Keyword docs are
 * not here: they come from the grammar file (`generated/docs.ts`).
 */
import type { CompletionKind, Range, TokenStream } from '@mermaid-js/core/parser-kit';
import type {
  WardleyAnchorNode,
  WardleyComponentNode,
  WardleyDocument,
  WardleyName,
  WardleyNumber,
  WardleyPipelineComponentNode,
  WardleyStatementNode,
} from '../parser/ast.ts';
import { KEYWORD_STARTS } from '../parser/tables.ts';
import { KEYWORDS, STRATEGIES, T, TEXT_STATEMENTS } from '../parser/tokens.ts';
export { inside } from '@mermaid-js/core/parser-kit/facet';
export { tokenBefore } from '@mermaid-js/core/parser-kit/facet';
export { span } from '@mermaid-js/core/parser-kit/facet';
export { code } from '@mermaid-js/core/parser-kit/facet';

/** An item offered when the parser expects `kind`. */
export interface KeywordItem {
  readonly kind: number;
  readonly label: string;
  readonly item: CompletionKind;
  /** Text inserted, when it is not the label. */
  readonly insert?: string;
  /** One short line next to the label. */
  readonly detail?: string;
  /** Offered only as the first word of its line (the statements). */
  readonly lineStart?: true;
  /** A `(strategy)`: offered only where a strategy may still come (not after one). */
  readonly strategy?: true;
}

const statement = (kind: number, label: string, insert = `${label} `): KeywordItem => ({
  kind,
  label,
  item: 'keyword',
  insert,
  lineStart: true,
});

const operator = (kind: number, label: string, detail: string): KeywordItem => ({
  kind,
  label,
  item: 'operator',
  detail,
});

/** A keyword's word, from the lexer's table. */
const word = (kind: number): string => KEYWORDS.find(([, k]) => k === kind)?.[0] ?? '';

/** The text statements' words, from the parser's table. */
const textWord = (kind: number): string => TEXT_STATEMENTS[kind]?.word ?? '';

/** The statement keywords (every keyword but `label` and `inertia`), in the lexer's order. */
const STATEMENT_KEYWORDS = KEYWORDS.filter(([, k]) => KEYWORD_STARTS.includes(k));

/**
 * Everything completion offers but node names, in the order it is offered. After a component's
 * coordinates, in v12's order: `label`, a strategy, `inertia` (each optional, in that order).
 * After a link's first name, every arrow and flow v12 reads (`LINK_ARROW`, `ARROW`, `LINK_PORT`).
 */
export const ITEMS: readonly KeywordItem[] = [
  { kind: T.WardleyBeta, label: 'wardley-beta', item: 'keyword' },
  statement(T.Title, textWord(T.Title)),
  statement(T.AccTitle, textWord(T.AccTitle), `${textWord(T.AccTitle)}: `),
  // `accDescr` takes one line or a block: both forms are offered.
  statement(T.AccDescr, `${textWord(T.AccDescr)}:`, `${textWord(T.AccDescr)}: `),
  statement(T.AccDescr, `${textWord(T.AccDescr)} {`, `${textWord(T.AccDescr)} { }`),
  ...STATEMENT_KEYWORDS.map(([w, k]) => statement(k, w)),
  { kind: T.Label, label: word(T.Label), item: 'keyword', insert: `${word(T.Label)} ` },
  ...STRATEGIES.map(
    (s): KeywordItem => ({ kind: T.LParen, label: `(${s})`, item: 'constant', strategy: true })
  ),
  // Inside a component's `(`, where a strategy or `inertia` goes.
  ...STRATEGIES.map((s): KeywordItem => ({ kind: T.Strategy, label: s, item: 'constant' })),
  { kind: T.Inertia, label: word(T.Inertia), item: 'keyword' },
  { kind: T.LParen, label: `(${word(T.Inertia)})`, item: 'keyword' },
  operator(T.Arrow, '->', 'link'),
  operator(T.LinkArrow, '-.->', 'dashed link'),
  operator(T.LinkArrow, '-->', 'link, drawn as `->`'),
  operator(T.LinkArrow, '>', 'link, drawn as `->`'),
  operator(T.LinkPort, '+>', 'flow forward'),
  operator(T.LinkPort, '+<', 'flow backward'),
  operator(T.LinkPort, '+<>', 'flow both ways'),
  operator(T.LinkArrow, "+'label'>", 'labelled flow forward'),
  operator(T.LinkArrow, "+'label'<", 'labelled flow backward'),
  operator(T.LinkArrow, "+'label'<>", 'labelled flow both ways'),
];

/** What declares a node name: an anchor, a component or a pipeline's component. */
export type NodeDeclaration =
  | WardleyAnchorNode
  | WardleyComponentNode
  | WardleyPipelineComponentNode;

/** How hover and completion name a declaration's kind. */
export function declarationKind(d: NodeDeclaration): string {
  if (d.type === 'Anchor') return 'anchor';
  return d.type === 'Component' ? 'component' : 'pipeline component';
}

/**
 * The declared node names, in the order they are first declared; each name's anchors and
 * components (a pipeline's included) in source order, the first its definition (D427).
 */
export function declaredNodes(doc: WardleyDocument): Map<string, NodeDeclaration[]> {
  const out = new Map<string, NodeDeclaration[]>();
  const add = (d: NodeDeclaration) => {
    const list = out.get(d.name.value);
    if (list) list.push(d);
    else out.set(d.name.value, [d]);
  };
  for (const n of doc.children) {
    if (n.type === 'Anchor' || n.type === 'Component') add(n);
    else if (n.type === 'Pipeline') n.children.forEach(add);
  }
  return out;
}

/** A coordinate as written, with the axis it is on. */
export interface Coordinate {
  readonly axis: 'visibility' | 'evolution';
  readonly number: WardleyNumber;
}

/** The coordinates a statement writes (`[visibility, evolution]`, an evolve target). */
export function coordinatesOf(n: WardleyStatementNode): Coordinate[] {
  if (n.type === 'Evolve') return [{ axis: 'evolution', number: n.target }];
  if (n.type === 'Pipeline') {
    return n.children.map((c) => ({ axis: 'evolution', number: c.evolution }));
  }
  if (!('visibility' in n)) return [];
  return [
    { axis: 'visibility', number: n.visibility },
    { axis: 'evolution', number: n.evolution },
  ];
}

/** The names a statement refers to a node by (links, `evolve`, `pipeline`, (de)accelerators). */
export function referencesOf(n: WardleyStatementNode): WardleyName[] {
  if (n.type === 'Link') return [n.from, n.to];
  if (n.type === 'Pipeline') return [n.parent];
  if (n.type === 'Evolve' || n.type === 'Accelerator' || n.type === 'Deaccelerator') {
    return [n.name];
  }
  return [];
}

/** A percentage for text: at most two decimals, no trailing zeros (`43 %`, `12.5 %`). */
export const showPercent = (value: number): string => `${Number(value.toFixed(2))} %`;
