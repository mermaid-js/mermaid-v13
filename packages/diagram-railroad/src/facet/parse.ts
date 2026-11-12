// cspell:words titlex
/**
 * The railroad facet's parse (DESIGN §4.5): `parseRailroad`, plus what only the language
 * service reports. None of it changes what a render draws or warns:
 *
 * - D513's hints, `info` diagnostics that say what v12 does where its lexer surprises: a name
 *   that starts with `title` (split into a `title` line and the rest), `title = …` (a title
 *   line, not a rule), and an ABNF `;` comment that swallows a rule's end. A header in another
 *   case needs no hint: the parser's error says what v12 does.
 * - The symbols of a rule that fails to parse (`keepFailedRules`): its name still defines it.
 * - D517: a warning at each reference to a rule no rule defines (v12 draws it all the same).
 * - Folds: a multi-line `/* *\/` or `(* *)` comment is a `comment` statement, and a multi-line
 *   EBNF special `? … ?` a `special` statement, inside the rule that holds them.
 *
 * A probe parse (completion) gets the parser's result alone.
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import type {
  Diagnostic,
  Range,
  StatementSpan,
  SymbolOccurrence,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import type { RailroadParseOptions, RailroadParseResult } from '../parser/parser.ts';
import { parseRailroad } from '../parser/parse.ts';
import { T } from '../parser/tokens.ts';
import type { RailroadNotation } from '../parser/tokens.ts';
import { atLineStart, isTrivia, notationOf } from './tables.ts';
import { code } from '@mermaid-js/core/parser-kit/facet';

/** D513's hint codes, and D517's undefined reference. */
export const RAILROAD_TITLE_PREFIX = 'RAILROAD_TITLE_PREFIX';
export const RAILROAD_TITLE_RULE = 'RAILROAD_TITLE_RULE';
export const RAILROAD_SEMI_COMMENT = 'RAILROAD_SEMI_COMMENT';
export const RAILROAD_UNDEFINED_RULE = 'RAILROAD_UNDEFINED_RULE';

/** What follows a rule's name in each notation, as text and as token kinds. */
const DEFINES: Readonly<Record<RailroadNotation, string>> = {
  railroad: '`=`',
  railroadEbnf: '`=` or `::=`',
  railroadAbnf: '`=`',
  railroadPeg: '`<-`',
};
const DEFINE_KINDS: Readonly<Record<RailroadNotation, readonly number[]>> = {
  railroad: [T.Equals],
  railroadEbnf: [T.Equals, T.Define],
  railroadAbnf: [T.Equals],
  railroadPeg: [T.Arrow],
};
/** `title`, blanks, then the notation's `=`: one `title` token holding a would-be rule. */
const DEFINE_AFTER_TITLE: Readonly<Record<RailroadNotation, RegExp>> = {
  railroad: /^title[\t ]+=/,
  railroadEbnf: /^title[\t ]+(?:=|::=)/,
  railroadAbnf: /^title[\t ]+=/,
  railroadPeg: /^title[\t ]+<-/,
};
/** What can end an ABNF element, before a `;` meant to end its rule. */
const ELEMENT_ENDS: readonly number[] = [T.String, T.NumVal, T.Id, T.RParen, T.RBracket];

const LINE_BREAK = /[\r\n]/;

const info = (id: string, message: string, range: Range): Diagnostic => ({
  severity: 'info',
  code: id,
  message,
  range,
});

/** The significant token before (`step` -1) or after (+1) token `j`, or -1. */
function significant(tokens: TokenStream, j: number, step: 1 | -1): number {
  for (let k = j + step; k >= 0 && k < tokens.length; k += step) {
    if (!isTrivia(tokens.kind[k] ?? Kind.EOF)) return k;
  }
  return -1;
}

/**
 * The `title` hints at the `title` token `j`. As the oracle reads them (mermaid\@12, checked in
 * `conformance/src/railroad/language-hints.spec.ts`): a name glued to `title` that the notation's
 * lexer reads as a name splits (`titleCase`, IR `title_x`, ABNF `titlex`), where a character no
 * name starts with (`title-x`, ABNF `title_x`) is a lexer error with no hint; and `title`
 * followed by the notation's `=`, glued or after blanks, is a title line, not a rule.
 */
function titleHint(
  text: string,
  tokens: TokenStream,
  j: number,
  notation: RailroadNotation
): Diagnostic | undefined {
  const start = tokens.start[j] ?? 0;
  const end = tokens.end[j] ?? 0;
  const next = tokens.kind[j + 1];
  const glued = end - start === 'title'.length && (tokens.start[j + 1] ?? -1) === end;
  if (glued && next === T.Id) {
    const rest = text.slice(end, tokens.end[j + 1] ?? end);
    const word = `title${rest}`;
    return info(
      RAILROAD_TITLE_PREFIX,
      `A name that starts with \`title\` splits, as in v12: ${code(word)} reads as an empty \`title\` line and then ${code(rest)}. Rename it so it does not start with \`title\`.`,
      { start, end: start + word.length }
    );
  }
  const define =
    (glued && next !== undefined && DEFINE_KINDS[notation].includes(next)) ||
    DEFINE_AFTER_TITLE[notation].test(text.slice(start, end));
  if (!define) return undefined;
  return info(
    RAILROAD_TITLE_RULE,
    `\`title\` followed by ${DEFINES[notation]} is a \`title\` line, as in v12, not a rule named \`title\`: a rule cannot be named \`title\`.`,
    { start, end: start + 'title'.length }
  );
}

/**
 * The ABNF `;` hint at the `;` comment token `j`: only where the comment swallows the `;` meant
 * to end a rule, so the rule then fails to end (v12 rejects it too, checked against the oracle):
 * after code on its line, right after an element, and followed by a new rule or the end of the
 * text. A comment at the end of a line the rule goes on after is deliberate: no hint.
 */
function semiHint(text: string, tokens: TokenStream, j: number): Diagnostic | undefined {
  const start = tokens.start[j] ?? 0;
  if (atLineStart(text, start)) return undefined;
  const before = significant(tokens, j, -1);
  if (before < 0 || !ELEMENT_ENDS.includes(tokens.kind[before] ?? Kind.EOF)) return undefined;
  const after = significant(tokens, j, 1);
  const k = after < 0 ? Kind.EOF : (tokens.kind[after] ?? Kind.EOF);
  const ruleStart = k === T.Id && tokens.kind[significant(tokens, after, 1)] === T.Equals;
  if (k !== Kind.EOF && !ruleStart) return undefined;
  const blanks = text.slice(start + 1, tokens.end[j] ?? start).trim() === '';
  return info(
    RAILROAD_SEMI_COMMENT,
    blanks
      ? 'In ABNF, as in v12, a `;` followed by blanks before the line end starts a comment, so it does not end the rule. Remove the blanks after it.'
      : 'In ABNF, as in v12, a `;` with more text after it on its line starts a comment that runs to the line end, so it does not end the rule. End the rule with `;` at the end of its line.',
    { start, end: start + 1 }
  );
}

/** D513's hints, in source order. */
function hints(text: string, tokens: TokenStream, notation: RailroadNotation): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (let j = 0; j < tokens.length; j++) {
    const kind = tokens.kind[j];
    let hint: Diagnostic | undefined;
    if (kind === T.Title) hint = titleHint(text, tokens, j, notation);
    else if (kind === T.SemiComment) hint = semiHint(text, tokens, j);
    if (hint) out.push(hint);
  }
  return out;
}

/**
 * A warning at each reference to a rule that no rule defines (D517). A name a failed rule only
 * may hold (recorded over more than the name, `keepFailedRules`) is not reported.
 */
function undefinedReferences(text: string, result: RailroadParseResult): Diagnostic[] {
  const defined = new Set(result.symbols.filter((s) => s.role === 'def').map((s) => s.name));
  const named = (s: SymbolOccurrence) => text.slice(s.range.start, s.range.end) === s.name;
  return result.symbols
    .filter((s) => s.role === 'ref' && !defined.has(s.name) && named(s))
    .map((s) => ({
      severity: 'warning' as const,
      code: RAILROAD_UNDEFINED_RULE,
      message: `No rule named ${code(s.name)} is defined. The diagram still draws its box, as v12 did.`,
      range: s.range,
    }));
}

/** `own` with `extra` (each in source order) merged in, `own` first on a tie. */
function merged(own: readonly Diagnostic[], extra: readonly Diagnostic[]): Diagnostic[] {
  if (extra.length === 0) return [...own];
  const out: Diagnostic[] = [];
  let i = 0;
  for (const d of extra) {
    while (i < own.length && own[i]!.range.start <= d.range.start) out.push(own[i++]!);
    out.push(d);
  }
  return [...out, ...own.slice(i)];
}

/**
 * The statements with the multi-line comments (`comment`) and EBNF specials (`special`) added,
 * in source order: each inside the statement that holds it (a comment or special inside a rule
 * is a child of the rule), else at the top level.
 */
function withFolds(statements: readonly StatementSpan[], tokens: TokenStream, text: string) {
  const folds: StatementSpan[] = [];
  for (let j = 0; j < tokens.length; j++) {
    const kind = tokens.kind[j];
    const comment = kind === T.BlockComment || kind === T.IsoComment;
    if (!comment && kind !== T.Special) continue;
    const range = { start: tokens.start[j] ?? 0, end: tokens.end[j] ?? 0 };
    if (!LINE_BREAK.test(text.slice(range.start, range.end))) continue;
    folds.push({ kind: comment ? 'comment' : 'special', range });
  }
  if (folds.length === 0) return [...statements];
  // Both lists are in source order: each fold goes into the statement that holds it.
  let k = 0;
  const out: StatementSpan[] = [];
  for (const s of statements) {
    while (k < folds.length && folds[k]!.range.start < s.range.start) out.push(folds[k++]!);
    const inside: StatementSpan[] = [];
    while (k < folds.length && folds[k]!.range.end <= s.range.end) inside.push(folds[k++]!);
    out.push(inside.length === 0 ? s : { ...s, children: [...(s.children ?? []), ...inside] });
  }
  out.push(...folds.slice(k));
  return out;
}

/**
 * The facet's parse of `text`: the parser's result, with the language service's additions. The
 * tokens are always kept (the service always asks for them; the additions read them).
 */
export function parseForLanguage(
  text: string,
  options: RailroadParseOptions = {}
): RailroadParseResult {
  const result = parseRailroad(text, { ...options, keepTokens: true, keepFailedRules: true });
  const tokens = result.tokens;
  // A probe parse is for completion, which reads the probe and the tokens only.
  if (!tokens || options.probe !== undefined) return result;
  const extra = [
    ...hints(text, tokens, notationOf(result.model)),
    ...undefinedReferences(text, result),
  ];
  return {
    ...result,
    diagnostics: merged(
      result.diagnostics,
      extra.sort((a, b) => a.range.start - b.range.start)
    ),
    statements: withFolds(result.statements, tokens, text),
  };
}
