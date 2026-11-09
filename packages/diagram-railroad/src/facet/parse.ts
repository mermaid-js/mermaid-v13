/**
 * The railroad facet's parse (DESIGN §4.5): `parseRailroad`, plus what only the language
 * service reports. None of it changes what a render draws or warns:
 *
 * - D513's hints, `info` diagnostics that say what v12 does where its lexer surprises: a name
 *   that starts with `title` (split into a `title` line and the rest), `title = …` (a title
 *   line, not a rule), an ABNF `;` with more on its line (a comment, not a rule end), and a
 *   header written in another case (detected, then rejected).
 * - D517: a warning at each reference to a rule no rule defines (v12 draws it all the same).
 * - Folds: a multi-line `/* *\/` or `(* *)` comment is a `comment` statement, and a multi-line
 *   EBNF special `? … ?` a `special` statement inside its rule's.
 */
import { inKindSet, isSpace } from '@mermaid-js/core/parser-kit';
import type { Diagnostic, Range, StatementSpan, TokenStream } from '@mermaid-js/core/parser-kit';
import type { RailroadParseOptions, RailroadParseResult } from '../parser/base.ts';
import { RAILROAD_HEADERS } from '../parser/detect.ts';
import { parseRailroad } from '../parser/parse.ts';
import { RAILROAD_TRIVIA, T } from '../parser/tokens.ts';
import type { RailroadNotation } from '../parser/tokens.ts';
import { code, notationOf } from './tables.ts';

/** D513's hint codes, and D517's undefined reference. */
export const RAILROAD_TITLE_PREFIX = 'RAILROAD_TITLE_PREFIX';
export const RAILROAD_TITLE_RULE = 'RAILROAD_TITLE_RULE';
export const RAILROAD_SEMI_COMMENT = 'RAILROAD_SEMI_COMMENT';
export const RAILROAD_HEADER_CASE = 'RAILROAD_HEADER_CASE';
export const RAILROAD_UNDEFINED_RULE = 'RAILROAD_UNDEFINED_RULE';

/** What follows a rule's name in each notation. */
const DEFINES: Readonly<Record<RailroadNotation, string>> = {
  railroad: '`=`',
  railroadEbnf: '`=` or `::=`',
  railroadAbnf: '`=`',
  railroadPeg: '`<-`',
};
const DEFINE_AFTER_TITLE: Readonly<Record<RailroadNotation, RegExp>> = {
  railroad: /^title[\t ]+=/,
  railroadEbnf: /^title[\t ]+(?:=|::=)/,
  railroadAbnf: /^title[\t ]+=/,
  railroadPeg: /^title[\t ]+<-/,
};

const LINE_BREAK = /[\r\n]/;

const info = (id: string, message: string, range: Range): Diagnostic => ({
  severity: 'info',
  code: id,
  message,
  range,
});

const isTrivia = (kind: number) => inKindSet(RAILROAD_TRIVIA, kind);

/** The header in another case than the keyword's: v12 detects it, then rejects it. */
function headerHint(
  text: string,
  tokens: TokenStream,
  bodyStart: number,
  notation: RailroadNotation
): Diagnostic | undefined {
  let j = 0;
  while (j < tokens.length && ((tokens.start[j] ?? 0) < bodyStart || isTrivia(tokens.kind[j]!)))
    j++;
  if (j >= tokens.length || tokens.kind[j] === T.Header) return undefined;
  const range = { start: tokens.start[j] ?? 0, end: tokens.end[j] ?? 0 };
  const word = text.slice(range.start, range.end);
  const header = RAILROAD_HEADERS.find(([n]) => n === notation)?.[1] ?? 'railroad-beta';
  if (word === header || word.toLowerCase() !== header) return undefined;
  return info(
    RAILROAD_HEADER_CASE,
    `v12 detects ${code(word)} as a railroad diagram, since detection ignores case, and then rejects it: its parser reads the keyword in lower case only. Write ${code(header)}.`,
    range
  );
}

/** `titleCase`, `title-x`: `title` and a name glued to it. */
function titlePrefixHint(text: string, tokens: TokenStream, j: number): Diagnostic | undefined {
  const start = tokens.start[j] ?? 0;
  const end = tokens.end[j] ?? 0;
  const next = tokens.kind[j + 1];
  if (end - start !== 'title'.length || next === undefined || isTrivia(next)) return undefined;
  if ((tokens.start[j + 1] ?? 0) !== end) return undefined;
  const glued = /title[\w-]+/y;
  glued.lastIndex = start;
  const word = glued.exec(text)?.[0];
  if (word === undefined) return undefined;
  const rest = word.slice('title'.length);
  return info(
    RAILROAD_TITLE_PREFIX,
    `A name that starts with \`title\` splits, as in v12: ${code(word)} reads as an empty \`title\` line and then ${code(rest)}. Rename it so it does not start with \`title\`.`,
    { start, end: start + word.length }
  );
}

/** D513's hints, in source order. */
function hints(
  text: string,
  tokens: TokenStream,
  bodyStart: number,
  notation: RailroadNotation
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const header = headerHint(text, tokens, bodyStart, notation);
  if (header) out.push(header);
  for (let j = 0; j < tokens.length; j++) {
    const kind = tokens.kind[j];
    const start = tokens.start[j] ?? 0;
    if (kind === T.Title) {
      const glued = titlePrefixHint(text, tokens, j);
      if (glued) out.push(glued);
      else if (DEFINE_AFTER_TITLE[notation].test(text.slice(start, tokens.end[j] ?? start))) {
        out.push(
          info(
            RAILROAD_TITLE_RULE,
            `\`title\` followed by ${DEFINES[notation]} is a \`title\` line, as in v12: the rest of the line is the title, and no rule named \`title\` is defined. A rule cannot be named \`title\`.`,
            { start, end: start + 'title'.length }
          )
        );
      }
    } else if (kind === T.SemiComment && !atLineStart(text, start)) {
      const blanks = text.slice(start + 1, tokens.end[j] ?? start).trim() === '';
      out.push(
        info(
          RAILROAD_SEMI_COMMENT,
          blanks
            ? 'In ABNF, as in v12, a `;` followed by blanks before the line end starts a comment, so it does not end the rule. Remove the blanks after it.'
            : 'In ABNF, as in v12, a `;` with more text after it on its line starts a comment that runs to the line end, so it does not end the rule. End the rule with `;` at the end of its line.',
          { start, end: start + 1 }
        )
      );
    }
  }
  return out;
}

/** Whether only blanks come before `at` on its line. */
function atLineStart(text: string, at: number): boolean {
  let i = at;
  while (i > 0 && !LINE_BREAK.test(text.charAt(i - 1))) {
    if (!isSpace(text.charCodeAt(i - 1))) return false;
    i--;
  }
  return true;
}

/** A warning at each reference to a rule that no rule defines (D517). */
function undefinedReferences(result: RailroadParseResult): Diagnostic[] {
  const defined = new Set(result.symbols.filter((s) => s.role === 'def').map((s) => s.name));
  return result.symbols
    .filter((s) => s.role === 'ref' && !defined.has(s.name))
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
 * The statements with the multi-line comments (`comment`) and EBNF specials (`special`, inside
 * the rule that holds them) added, in source order.
 */
function withFolds(statements: readonly StatementSpan[], tokens: TokenStream, text: string) {
  const comments: StatementSpan[] = [];
  const specials: StatementSpan[] = [];
  for (let j = 0; j < tokens.length; j++) {
    const kind = tokens.kind[j];
    const comment = kind === T.BlockComment || kind === T.IsoComment;
    if (!comment && kind !== T.Special) continue;
    const range = { start: tokens.start[j] ?? 0, end: tokens.end[j] ?? 0 };
    if (!LINE_BREAK.test(text.slice(range.start, range.end))) continue;
    (comment ? comments : specials).push({ kind: comment ? 'comment' : 'special', range });
  }
  if (comments.length === 0 && specials.length === 0) return [...statements];
  // Both lists are in source order: each special goes into the statement that holds it.
  let k = 0;
  const out: StatementSpan[] = statements.map((s) => {
    while (k < specials.length && specials[k]!.range.start < s.range.start) k++;
    const inside: StatementSpan[] = [];
    while (k < specials.length && specials[k]!.range.end <= s.range.end)
      inside.push(specials[k++]!);
    return inside.length === 0 ? s : { ...s, children: [...(s.children ?? []), ...inside] };
  });
  out.push(...comments);
  return out.sort((a, b) => a.range.start - b.range.start);
}

/**
 * The facet's parse of `text`: the parser's result, with the language service's additions. The
 * tokens are always kept (the service always asks for them; the additions read them).
 */
export function parseForLanguage(
  text: string,
  options: RailroadParseOptions = {}
): RailroadParseResult {
  const result = parseRailroad(text, { ...options, keepTokens: true });
  const tokens = result.tokens;
  if (!tokens) return result;
  const notation = notationOf(result.model);
  const extra = [
    ...hints(text, tokens, result.ast.range.start, notation),
    ...undefinedReferences(result),
  ].sort((a, b) => a.range.start - b.range.start);
  return {
    ...result,
    diagnostics: merged(result.diagnostics, extra),
    statements: withFolds(result.statements, tokens, text),
  };
}
