/**
 * Info lexer: the token rules of v12's Chevrotain lexer (`@mermaid-js/parser@2.0.1`, built
 * from `info.langium` and `common.langium`), in its order (parser-method §1, D213):
 *
 *   showInfo, info, ACC_DESCR, ACC_TITLE, TITLE, NEWLINE, WHITESPACE (skipped), YAML,
 *   DIRECTIVE, SINGLE_LINE_COMMENT (hidden).
 *
 * It is pie's lexer (`diagram-pie`, #304) with pie's own rules (`:`, NUMBER_PIE, STRING) taken
 * out: both grammars take every other terminal from `common.langium`. Chevrotain facts it
 * reproduces: the first rule in order wins (no longest match, no rule here has a longer
 * alternative); `\s`/`\S` are JS's; `[^\n\r]` stops at LF and CR only. Where no rule matches it
 * writes one `Error` token over the characters up to the next offset where one does, as
 * Chevrotain skips them.
 *
 * Like the other v13 lexers it lexes the text v12 lexed (pitfall 1): the source view
 * ({@link sourceView}) cuts the comment lines, directives and dropped `;` v12 removed, and
 * marks the tag quotes it turned into `'`; every token maps back to its range in the source,
 * which is never rewritten, and each removed span is a trivia token in source order. v12 turned
 * CRLF and CR into LF; here a CRLF is one line break and a lone CR is one, as LF would be.
 * Entities need nothing: v12's placeholders lex as the `#…;` they replace.
 *
 * Every scan is linear in the text (R-PARSE-7, pitfall 5): an `accDescr {…}`, YAML or
 * directive scan that failed is not repeated for a start it covered.
 */
// cspell:words accdescr acctitle
import { DASH, isBlank, Kind, newlineAt, PERCENT } from '@mermaid-js/core/parser-kit';
import { isBreak, RuleLexer, SKIP } from '@mermaid-js/core/parser-kit/rule';
import type { RuleLexerOptions } from '@mermaid-js/core/parser-kit/rule';
import type { SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { T } from './tokens.ts';

/** The shared terminals' kinds, and about how many characters one token takes. */
const OPTIONS: RuleLexerOptions = {
  accDescr: T.AccDescr,
  accTitle: T.AccTitle,
  title: T.Title,
  yaml: T.Yaml,
  charsPerToken: 8,
};

/**
 * Lex the info body `src[from…]`. `view` comes from {@link sourceView} (default options: v12's
 * info ran every shared rewrite).
 */
export function lex(src: string, from: number, view: SourceView): TokenStream {
  return new InfoLexer(src, from, view, OPTIONS).run();
}

/** One lex. Offsets are into {@link text}; {@link emit} maps them to the source. */
class InfoLexer extends RuleLexer {

  /** The end of the rule that matches at `p` (its kind in {@link kind}), or -1. */
  protected scan(p: number): number {
    const c = this.text.charCodeAt(p);
    let e = this.keyword('showInfo', p, T.ShowInfo);
    if (e < 0) e = this.keyword('info', p, T.Info);
    if (e < 0) e = this.accessibility(p);
    if (e < 0 && isBreak(c)) e = this.match(Kind.Newline, p + newlineAt(this.text, p));
    if (e < 0 && isBlank(c)) e = this.match(SKIP, this.blanks(p));
    if (e < 0 && c === DASH) e = this.yaml(p);
    if (e < 0 && c === PERCENT && this.text.charCodeAt(p + 1) === PERCENT) {
      e = this.directive(p);
      if (e < 0) e = this.match(Kind.Comment, this.lineEnd(p + 2));
    }
    return e;
  }
}
