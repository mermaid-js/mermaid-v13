/**
 * What a flow-family dialect's lexer is made of besides its rules: the start conditions, the
 * character classes, the keyword table and the options a diagram hands the family's lexer
 * (`flow-lexer.ts`).
 */
import { ASCII_MAX, charTable, CR, LF } from '@mermaid-js/core/parser-kit';
import type { FlowKinds } from './flow-kinds.ts';

/** Start conditions of flow.jison (the ones the lexer needs). */
export const FLOW_STATE = {
  INITIAL: 0,
  string: 1,
  md_string: 2,
  acc_title: 3,
  acc_descr: 4,
  acc_descr_multiline: 5,
  dir: 6,
  text: 7,
  ellipseText: 8,
  trapText: 9,
  edgeText: 10,
  thickEdgeText: 11,
  dottedEdgeText: 12,
  click: 13,
  callbackname: 14,
  callbackargs: 15,
  shapeData: 16,
  shapeDataStr: 17,
} as const;
/** Start condition names by number, for the probe's lexer mode. */
export const FLOW_STATE_NAMES: readonly string[] = /* @__PURE__ */ Object.keys(FLOW_STATE);

// Character classes of flow.jison's lexer rules.
/** jison's NODE_STRING (`-` and `=` are handled separately). */
export const NODE = 1;
/** Ends a run of `<text>`. */
export const TEXT_STOP = 2;
/** Ends a run of `<ellipseText>`. */
export const ELLIPSE_STOP = 4;
/** Ends a run of `<trapText>`. */
export const TRAP_STOP = 8;
/** Ends a run of `<shapeData>`. */
export const SHAPE_DATA_STOP = 16;

/**
 * The character classes of a dialect's rules. With `labelComments` (v12 left the comments in
 * the text it lexed), `%` is one of the characters a `<text>` or `<trapText>` run stops at: it
 * ends the run when another `%` follows.
 */
export function flowChars(labelComments: boolean): Uint8Array {
  const percent = labelComments ? '%' : '';
  return charTable(
    [NODE, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!"#$%&\'*+.`?\\_/'],
    [TEXT_STOP, '[](){}|' + percent],
    [ELLIPSE_STOP, '()[]{}'],
    [TRAP_STOP, '\\[](){}/' + percent],
    [SHAPE_DATA_STOP, '}^']
  );
}

/**
 * A keyword that is one token of its own (jison adds `\b`): its text, its kind, and what it
 * takes besides: `graph` for a header keyword (the first one opens the direction state),
 * `blanks` for the `[ \t]*` after it, `spaces` for the `\s*` after it.
 */
export type FlowKeyword = readonly [
  word: string,
  kind: number,
  tail?: 'graph' | 'blanks' | 'spaces',
];

/** A dialect's keywords by first character code, each list in jison's rule order. */
export type FlowKeywords = readonly (readonly FlowKeyword[] | undefined)[];

/** The table of a dialect's own keywords. `words` are in jison's rule order. */
export function flowKeywords(words: readonly FlowKeyword[]): FlowKeywords {
  // One entry a character code, none a hole: the lexer reads it at every token start.
  const table = new Array<FlowKeyword[] | undefined>(ASCII_MAX + 1).fill(undefined);
  for (const word of words) (table[word[0].charCodeAt(0)] ??= []).push(word);
  return table;
}

/** How one dialect's jison lexer read its text. Built once a diagram, at module scope. */
export interface FlowLexerDialect {
  /** The diagram's token kinds. */
  readonly kinds: FlowKinds;
  /** Its character classes ({@link flowChars}). */
  readonly chars: Uint8Array;
  /**
   * The keywords besides the ones every dialect has (`accTitle`, `accDescr`, `call`, `class`,
   * `classDef`, `click`, `href` and the link targets), which are tried first.
   */
  readonly keywords: FlowKeywords;
  /** About how many characters of text one token takes (sizes the token arrays). */
  readonly charsPerToken: number;
  /** v12 trimmed the text before lexing it: leading blanks are no tokens. */
  readonly trim: boolean;
}

/** A line break character (v12 turned a lone CR into LF). */
export const isNl = (c: number): boolean => c === LF || c === CR;
