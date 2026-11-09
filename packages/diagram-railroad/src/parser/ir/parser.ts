// cspell:words nonterminal
/**
 * The IR parser (`railroad-beta`): v12's `railroad.langium` rules and `railroadParser.ts`
 * mapping, over the IR lexer's tokens. The shared part (header, `title`/`acc*`, rules,
 * recovery) is `../base.ts`; `grammar/railroad.ebnf` is the normative form:
 *
 *     Expression: KEYWORD '(' …
 *       sequence(e, …)  choice(e, …)       a one-element sequence or choice is its element
 *       optional(e)     oneOrMore(e)  zeroOrMore(e)      repetition 1…∞ and 0…∞
 *       terminal("…")   nonterminal("…")   special("…")  the string decoded (`\n \r \t`)
 *
 * The keywords cannot name a rule (`choice = …` is an error, D513); a name that only starts
 * with one can (`sequenceX`).
 */
import { ExpectedTable, Kind } from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';
import { RailroadParser, RULE_START } from '../base.ts';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { RailroadParseOptions } from '../base.ts';
import { stringValue } from '../convert.ts';
import { T } from '../tokens.ts';
import { choice, leaf, optional, repetition, sequence } from '../tree.ts';
import type { Draft } from '../tree.ts';

const LISTS = [T.KwSequence, T.KwChoice];
const WRAPS = [T.KwOptional, T.KwOneOrMore, T.KwZeroOrMore];
const LEAVES = [T.KwTerminal, T.KwNonterminal, T.KwSpecial];
const EXPRESSION = [...LISTS, ...WRAPS, ...LEAVES];
const AFTER_ITEM = [T.Comma, T.RParen];

const LEAF_KIND: Readonly<Record<number, 'terminal' | 'nonterminal' | 'special'>> = {
  [T.KwTerminal]: 'terminal',
  [T.KwNonterminal]: 'nonterminal',
  [T.KwSpecial]: 'special',
};

const KEYWORD: Readonly<Record<number, string>> = {
  [T.KwSequence]: 'sequence',
  [T.KwChoice]: 'choice',
  [T.KwOptional]: 'optional',
  [T.KwOneOrMore]: 'oneOrMore',
  [T.KwZeroOrMore]: 'zeroOrMore',
  [T.KwTerminal]: 'terminal',
  [T.KwNonterminal]: 'nonterminal',
  [T.KwSpecial]: 'special',
};

const EXPECTED = new ExpectedTable([
  ['`railroad-beta`', [T.Header]],
  ['a rule such as `name = terminal("a") ;`', [RULE_START]],
  ['`=`', [T.Equals]],
  ['an expression such as `terminal("a")`, `nonterminal("b")` or `sequence(…)`', EXPRESSION],
  ['a string in quotes, such as `"a"`', [T.String]],
  ['`(`', [T.LParen]],
  ['`,` and another expression', [T.Comma]],
  ['`)`', [T.RParen]],
  ['`;` at the end of the rule', [T.Semi]],
  ['the end of the text', [Kind.EOF]],
]);

export class IrParser extends RailroadParser {
  protected readonly defines = [T.Equals];
  protected readonly expected = EXPECTED;

  constructor(src: string, options: RailroadParseOptions, computed?: PreprocessResult) {
    super(src, 'railroad', options, computed);
  }

  protected definition(): Draft {
    return this.expression();
  }

  /** `RailroadExpression`: one keyword call. */
  private expression(): Draft {
    this.tested(EXPRESSION);
    const k = this.kind();
    if (!EXPRESSION.includes(k)) this.fail(EXPRESSION);
    const kw = this.i++;
    this.expect(T.LParen);
    const at = this.range(kw);
    if (LEAVES.includes(k)) {
      const s = this.expect(T.String);
      const close = this.expect(T.RParen);
      const type = LEAF_KIND[k] ?? 'terminal';
      const text = stringValue('railroad', this.raw(s));
      if (type === 'nonterminal') this.reference(text, inside(this.range(s)));
      return leaf(type, text, this.span(kw, close));
    }
    if (WRAPS.includes(k)) {
      const inner = this.nested(at, () => this.expression());
      const close = this.expect(T.RParen);
      const range = this.span(kw, close);
      if (k === T.KwOptional) return this.deep(optional(inner, range));
      return this.deep(repetition(inner, k === T.KwOneOrMore ? 1 : 0, Infinity, range));
    }
    const items = this.nested(at, () => this.list());
    const close = this.expect(T.RParen);
    const range = this.span(kw, close);
    return this.deep(k === T.KwSequence ? sequence(items, range) : choice(items, range));
  }

  /** `e (',' e)*`: the arguments of `sequence(…)` or `choice(…)`. */
  private list(): Draft[] {
    const items = [this.expression()];
    for (;;) {
      this.tested(AFTER_ITEM);
      if (this.kind() !== T.Comma) return items;
      this.i++;
      items.push(this.expression());
    }
  }

  protected override explain(want: readonly number[]): string | undefined {
    const k = this.kind();
    const word = KEYWORD[k];
    if (word && want.includes(RULE_START)) {
      return `\`${word}\` is a keyword in this notation and cannot name a rule; rename the rule`;
    }
    if (k === T.Id && want.some((w) => EXPRESSION.includes(w))) {
      return `a rule is referred to as \`nonterminal("${this.raw()}")\`, and text as \`terminal("…")\``;
    }
    if (k === T.String && want.some((w) => EXPRESSION.includes(w))) {
      return 'write text as `terminal("…")`';
    }
    if (k === T.RParen && want.some((w) => EXPRESSION.includes(w))) {
      if (this.kind(this.i - 1) === T.Comma) return 'a `,` needs an expression after it';
      return 'a call needs an expression between its parentheses';
    }
    return super.explain(want);
  }
}

/** The text between a string's quotes. */
function inside(r: Range): Range {
  return { start: r.start + 1, end: Math.max(r.start + 1, r.end - 1) };
}
