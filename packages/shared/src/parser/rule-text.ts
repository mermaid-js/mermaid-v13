/**
 * What the langium-family parsers share around `title`, `accTitle` and `accDescr` (the
 * `TitleAndAccessibilities` rule of v12's `common.langium`): the table of the three statements
 * by token kind, their values, the probe's mode inside one, and the diagnostics for one that
 * the lexer could not read. Plain functions over a diagram's own token kinds.
 */
import {
  APOSTROPHE,
  type Diagnostics,
  DQUOTE,
  Kind,
  type Range,
  type TokenStream,
} from '@mermaid-js/core/parser-kit';
import { accDescrValue, accTitleValue, titleValue } from './common-values.ts';

/** One of `title …`, `accTitle: …` and `accDescr …`: its AST node type and its keyword. */
export interface TextStatement {
  readonly type: 'Title' | 'AccTitle' | 'AccDescr';
  /** The keyword: also the statement's span kind, its AST id base and its probe mode. */
  readonly word: 'title' | 'accTitle' | 'accDescr';
}

/** The text statements of one diagram, by token kind. */
export type TextStatements = Readonly<Partial<Record<number, TextStatement>>>;

/** `title`, the statement read where the kind is none of the three. */
export const TITLE_STATEMENT: TextStatement = /* @__PURE__ */ Object.freeze({
  type: 'Title',
  word: 'title',
});

/** The {@link TextStatements} of a diagram whose three token kinds are these. */
export function textStatements(title: number, accTitle: number, accDescr: number): TextStatements {
  return {
    [title]: TITLE_STATEMENT,
    [accTitle]: { type: 'AccTitle', word: 'accTitle' },
    [accDescr]: { type: 'AccDescr', word: 'accDescr' },
  };
}

/** The value of each text statement: the last one read (v12's Langium assignments). */
export interface TextValues {
  title: string;
  accTitle: string;
  accDescr: string;
}

/** The value of a text statement's token (`image`: its text as v12's lexer read it). */
export function textValue(type: TextStatement['type'], image: string): string {
  if (type === 'Title') return titleValue(image);
  return type === 'AccTitle' ? accTitleValue(image) : accDescrValue(image);
}

/** `range` without the blanks it starts with (a text statement's token takes its indent). */
export function withoutIndent(src: string, range: Range): Range {
  let { start } = range;
  while (start < range.end && isIndent(src.charCodeAt(start))) start++;
  return { start, end: range.end };
}

const isIndent = (c: number): boolean => c === 0x09 || c === 0x20;

/** What {@link textProbeMode} reads of a diagram's tokens. */
export interface ProbeModes {
  /** The diagram's text statements. */
  readonly texts: TextStatements;
  /** The kind of `accDescr` (its block form ends at its `}`). */
  readonly accDescr: number;
  /** The kind of a quoted string, in a diagram that has one. */
  readonly string?: number;
  /**
   * A mode of the diagram's own for the token `[start, end)` of `kind` that holds `o`
   * (`start < o <= end`), tried before the text statements; undefined for none.
   */
  readonly other?: (
    src: string,
    kind: number,
    start: number,
    end: number,
    o: number
  ) => string | undefined;
}

/**
 * A grammar's `probeMode` (R-LANG-7). The lexer has no modes (Langium's has none), so the mode
 * names what the offset `o` is in: `title`, `accTitle` or `accDescr` past the keyword of that
 * statement, `string` inside a string (closed or not), else `INITIAL` (code).
 */
export function textProbeMode(
  modes: ProbeModes
): (src: string, tokens: TokenStream, o: number) => string {
  const { texts, accDescr, string, other } = modes;
  return (src, tokens, o) => {
    for (let j = 0; j < tokens.length; j++) {
      const start = tokens.start[j] ?? 0;
      const end = tokens.end[j] ?? 0;
      if (start >= o) break;
      if (end < o) continue;
      const kind = tokens.kind[j] ?? Kind.EOF;
      if (string !== undefined) {
        if (kind === string && o < end) return 'string';
        // An unclosed string is an error token from its quote on.
        const c = src.charCodeAt(start);
        if (kind === Kind.Error && (c === DQUOTE || c === APOSTROPHE)) return 'string';
      }
      const own = other?.(src, kind, start, end, o);
      if (own !== undefined) return own;
      const word = texts[kind]?.word;
      if (!word) continue;
      let k = start;
      while (isIndent(src.charCodeAt(k))) k++;
      k += word.length;
      // A block `accDescr { … }` ends at its `}`; the other values run to the line end.
      const block = kind === accDescr && /^\s*\{/.test(src.slice(k, end));
      if (o > k && (o < end || !block)) return word;
    }
    return 'INITIAL';
  };
}

/**
 * Report `text`, which no token rule matched, when it starts with a quote: a label with no
 * closing quote. Whether it did.
 *
 * @param line - The 1-based line of `where`.
 */
export function unclosedLabel(
  diagnostics: Diagnostics,
  text: string,
  line: number,
  where: Range
): boolean {
  if (!text.startsWith('"') && !text.startsWith("'")) return false;
  const q = text[0] ?? '"';
  diagnostics.error(
    'UNCLOSED_STRING',
    `Unclosed label: the \`${q}\` at line ${line} has no closing \`${q}\`. Add \`${q}\` after the label.`,
    where,
    { expected: [`\`${q}\``] }
  );
  return true;
}

/**
 * Report `text`, which no token rule matched, when it starts with `accDescr` or `accTitle`:
 * an `accDescr {` with no `}`, or either keyword without its `:`. Whether it did.
 *
 * @param line - The 1-based line of `where`.
 */
export function unreadAccessibility(
  diagnostics: Diagnostics,
  text: string,
  line: number,
  where: Range
): boolean {
  const word = /^[\t ]*(accDescr|accTitle)/.exec(text)?.[1];
  if (word === 'accDescr') {
    diagnostics.error(
      'UNCLOSED_ACC_DESCR',
      `Unclosed accessible description: the \`accDescr {\` at line ${line} has no closing \`}\`, and \`accDescr\` without \`{\` takes a \`:\`. Write \`accDescr: …\` or \`accDescr { … }\`.`,
      where
    );
    return true;
  }
  if (word === 'accTitle') {
    diagnostics.error(
      'UNEXPECTED_CHARACTER',
      'Expected `:` after `accTitle`; write it as `accTitle: …`.',
      where,
      { expected: ['`:`'] }
    );
    return true;
  }
  return false;
}

/**
 * Report `accDescr` or `accTitle` read as a name (`word`): no `:` after it, or (`block`) a
 * `{` with no `}`, where v12's lexer has no accessibility token.
 *
 * @param line - The 1-based line of `where`.
 */
export function accessibilityAsName(
  diagnostics: Diagnostics,
  word: 'accDescr' | 'accTitle',
  block: boolean,
  line: number,
  where: Range
): void {
  if (word === 'accDescr' && block) {
    diagnostics.error(
      'UNCLOSED_ACC_DESCR',
      `Unclosed accessible description: the \`accDescr {\` at line ${line} has no closing \`}\`. Write \`accDescr { … }\` or \`accDescr: …\`.`,
      where
    );
    return;
  }
  diagnostics.error(
    'UNEXPECTED',
    `Expected \`:\` after \`${word}\`; write it as \`${word}: …\`${word === 'accDescr' ? ' or `accDescr { … }`' : ''}.`,
    where,
    { expected: ['`:`'] }
  );
}
