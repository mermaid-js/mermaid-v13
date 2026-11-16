/**
 * The usecase facet's completion and hover tables (DESIGN §4.5, D95): the statement keywords,
 * the arrow forms, the metadata keys and values per kind (v12's model builder), and what each
 * marker means. Keyword docs are not here: they come from the grammar file (`generated/docs.ts`).
 */
import type { UsecaseArrowType, UsecaseModel } from '../model.ts';
import type { UsecaseElementKind } from '../parser/ast.ts';
import { generatedId } from '../parser/text.ts';
import { ANY_CASE, KEYWORDS, T } from '../parser/tokens.ts';
import type { KeywordItem } from '@mermaid-js/shared/parser/facet';
export type { KeywordItem } from '@mermaid-js/shared/parser/facet';
export { plural } from '@mermaid-js/shared/parser/facet';
export { tokenBefore } from '@mermaid-js/shared/parser/facet';
export { span } from '@mermaid-js/shared/parser/facet';
export { code } from '@mermaid-js/shared/parser/facet';

/**
 * Statement keywords, in the order they are offered. `json` is not one: `json Id@` and its
 * object are one token, so the keyword alone is no statement start to offer.
 */
export const KEYWORD_ITEMS: readonly KeywordItem[] = [
  { kind: T.Usecase, label: 'usecase-beta' },
  { kind: T.Actor, label: 'actor' },
  { kind: T.SystemBoundary, label: 'systemBoundary' },
  { kind: T.End, label: 'end' },
  { kind: T.Note, label: 'note', insert: 'note for ' },
  { kind: T.ClassDef, label: 'classDef' },
  { kind: T.Class, label: 'class' },
  { kind: T.Style, label: 'style' },
  { kind: T.Direction, label: 'direction' },
  { kind: T.AccTitleLine, label: 'accTitle', insert: 'accTitle: ' },
  { kind: T.AccDescrLine, label: 'accDescr', insert: 'accDescr: ' },
];

/** The words the lexer reads as keywords: v12's keyword rules, `include`/`extend` in any case. */
const KEYWORD_WORDS = new Map<string, number>(KEYWORDS.map(([word, kind]) => [word, kind]));

/** Whether `word` lexes as a keyword where a name goes. */
export function isKeyword(word: string): boolean {
  if (KEYWORD_WORDS.has(word)) return true;
  const kind = KEYWORD_WORDS.get(word.toLowerCase());
  return kind !== undefined && ANY_CASE.has(kind);
}

/** Directions and what they mean. */
export const DIRECTIONS: readonly (readonly [dir: string, kind: number, meaning: string])[] = [
  ['TB', T.Tb, 'top to bottom'],
  ['TD', T.Td, 'top to bottom (the same as `TB`)'],
  ['BT', T.Bt, 'bottom to top'],
  ['LR', T.Lr, 'left to right (the default)'],
  ['RL', T.Rl, 'right to left'],
];

/** The arrow forms offered where an arrow goes: the text, its first token and what it draws. */
export const ARROW_FORMS: readonly (readonly [text: string, kind: number, meaning: string])[] = [
  ['-->', T.ForwardSolid, 'association, a point at the target'],
  ['<--', T.BackwardSolid, 'association, a point at the source'],
  ['--', T.MarkerlessSolid, 'association, no markers'],
  ['--o', T.ForwardCircle, 'association, a circle at the target'],
  ['o--', T.BackwardCircle, 'association, a circle at the source'],
  ['--x', T.ForwardCross, 'association, a cross at the target'],
  ['x--', T.BackwardCross, 'association, a cross at the source'],
  ['--|>', T.Generalization, 'generalization'],
  ['..> : include', T.DependencyArrow, 'the source includes the target'],
  ['..> : extend', T.DependencyArrow, 'the source extends the target'],
];

/** What an association's markers draw. */
export const ARROW_MEANING: Readonly<Record<UsecaseArrowType, string>> = {
  point: 'a point at the target',
  reversedPoint: 'a point at the source',
  line: 'no markers',
  circle: 'a circle at the target',
  cross: 'a cross at the target',
  reversedCircle: 'a circle at the source',
  reversedCross: 'a cross at the source',
};

/** The kinds `@{ … }` metadata belongs to. */
export type MetadataKind = 'actor' | 'usecase' | 'boundary' | 'edge';

/** A metadata key: the kinds that take it, its values (none: free text), what it does. */
export interface MetadataKey {
  readonly key: string;
  readonly kinds: readonly MetadataKind[];
  readonly values: readonly (readonly [value: string, meaning: string])[];
  readonly doc: string;
}

const BOOLEAN = [
  ['true', 'yes'],
  ['false', 'no (the default)'],
] as const;

/** The metadata v12's model builder takes, per kind. */
export const METADATA_KEYS: readonly MetadataKey[] = [
  {
    key: 'type',
    kinds: ['actor'],
    values: [
      ['normal', 'a stick figure (the default)'],
      ['hollow', 'a hollow figure'],
      ['awesome', 'a Font Awesome user icon'],
    ],
    doc: "The actor's figure.",
  },
  {
    key: 'type',
    kinds: ['boundary'],
    values: [
      ['rect', 'a rectangle (the default)'],
      ['package', 'a package with a tab'],
    ],
    doc: "The boundary's frame.",
  },
  { key: 'icon', kinds: ['actor'], values: [], doc: 'An icon for the actor, `"fa:user"`.' },
  {
    key: 'business',
    kinds: ['actor', 'usecase'],
    values: BOOLEAN,
    doc: 'A business actor or use case (a mark on the figure or oval).',
  },
  { key: 'animate', kinds: ['edge'], values: BOOLEAN, doc: 'Animates the relation line.' },
  {
    key: 'animation',
    kinds: ['edge'],
    values: [
      ['fast', 'a fast dash animation'],
      ['slow', 'a slow dash animation'],
    ],
    doc: 'The speed of the animated line.',
  },
];

/** An element the diagram declares or mentions, as completion and hover name it. */
export interface Declared {
  /** The id, as `class`, `style`, `note for` and relations write it bare. */
  readonly id: string;
  readonly kind: UsecaseElementKind;
  /** The label, when it is not the id. */
  readonly label?: string;
  /** The symbol's name: the label of a quoted element (D191), else the id. */
  readonly name: string;
}

/** Every element of `model` with an id: actors, use cases, boundaries, JSON tables, edge ids. */
export function declaredOf(model: UsecaseModel): Declared[] {
  const out: Declared[] = [];
  const add = (id: string, kind: UsecaseElementKind, label?: string) => {
    const quoted = label !== undefined && label !== id && generatedId(label) === id;
    out.push({
      id,
      kind,
      name: quoted ? label : id,
      ...(label !== undefined && label !== id ? { label } : {}),
    });
  };
  for (const a of model.actors) add(a.id, 'actor', a.label);
  for (const u of model.useCases) add(u.id, 'usecase', u.label);
  for (const b of model.boundaries) add(b.id, 'boundary', b.label);
  for (const j of model.jsonTables) add(j.id, 'json');
  for (const r of model.relationships) if (r.explicitId) add(r.id, 'edge');
  return out;
}

/** How hover and completion details name a kind. */
export const KIND_NAMES: Readonly<Record<UsecaseElementKind, string>> = {
  actor: 'actor',
  usecase: 'use case',
  boundary: 'system boundary',
  json: 'JSON table',
  edge: 'relation',
};
