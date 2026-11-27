/**
 * The EBNF parser (`railroad-ebnf-beta`): v12's `railroad-ebnf.langium` rules and
 * `ebnfParser.ts` mapping, over the EBNF lexer's tokens. The shared part (header,
 * `title`/`acc*`, rules, recovery) is `../parser.ts`; `grammar/railroad-ebnf.ebnf` is the
 * normative form:
 *
 *     Choice:   Sequence ('|' Sequence)*            a one-alternative choice is its alternative
 *     Sequence: Term (','? Term)*                   a one-element sequence is its element
 *     Term:     Primary Postfix*                    postfixes apply left to right, and stack
 *     Postfix:  '?' | '*' | '+' | '-' Primary       optional, 0…∞, 1…∞, and the exception
 *     Primary:  STRING | ID | SPECIAL | '(' Choice ')' | '[' Choice ']' | '\{' Choice '\}'
 *
 * A group is its contents, `[ ]` an optional, `{ }` a repetition 0…∞, `? … ?` a special
 * (trimmed). The exception `A - B` is v12's `sequence[A, terminal('-'), B]`.
 */
import { ExpectedTable, Kind } from '@mermaid-js/core/parser-kit';
import { RailroadParser, RULE_START } from '../parser.ts';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { RailroadParseOptions } from '../parser.ts';
import { specialValue, stringValue } from '../convert.ts';
import { T } from '../tokens.ts';
import { choice, leaf, optional, repetition, sequence } from '../tree.ts';
import type { Draft } from '../tree.ts';

const OPENERS = [T.LParen, T.LBracket, T.LBrace];
const PRIMARY = [T.String, T.Id, T.Special, ...OPENERS];
const POSTFIX = [T.Question, T.Star, T.Plus, T.Minus];
const AFTER_TERM = [...POSTFIX, T.Comma, ...PRIMARY, T.Pipe];

/** Each opener's closer and what the bracketed choice becomes. */
const CLOSER: Readonly<Record<number, number>> = {
  [T.LParen]: T.RParen,
  [T.LBracket]: T.RBracket,
  [T.LBrace]: T.RBrace,
};

const EXPECTED = new ExpectedTable([
  ['`railroad-ebnf-beta`', [T.Header]],
  ['a rule such as `name = "a" ;`', [RULE_START]],
  ['`=` or `::=`', [T.Equals, T.Define]],
  ['a string in quotes, such as `"a"`, or a rule name', [T.String, T.Id]],
  ['a special sequence such as `? any character ?`', [T.Special]],
  ['a group in `( )`, `[ ]` or `{ }`', OPENERS],
  ['`?`, `*`, `+` or `-` after an element', POSTFIX],
  ['`,` and another element', [T.Comma]],
  ['`|` and another alternative', [T.Pipe]],
  ['`)`', [T.RParen]],
  ['`]`', [T.RBracket]],
  ['`}`', [T.RBrace]],
  ['`;` at the end of the rule', [T.Semi]],
  ['the end of the text', [Kind.EOF]],
]);

export class EbnfParser extends RailroadParser {
  protected readonly defines = [T.Equals, T.Define];
  protected readonly expected = EXPECTED;

  constructor(src: string, options: RailroadParseOptions, computed?: PreprocessResult) {
    super(src, 'railroadEbnf', options, computed);
  }

  protected definition(): Draft {
    return this.choice();
  }

  /** `Sequence ('|' Sequence)*` */
  private choice(): Draft {
    const items = [this.sequence()];
    while (this.kind() === T.Pipe) {
      this.i++;
      items.push(this.sequence());
    }
    return this.deep(choice(items));
  }

  /** `Term (','? Term)*`: the terms run on while the next token can start one. */
  private sequence(): Draft {
    const items = [this.term()];
    for (;;) {
      this.tested(AFTER_TERM);
      const k = this.kind();
      if (k === T.Comma) {
        this.i++;
        items.push(this.term());
      } else if (PRIMARY.includes(k) && !this.startsRule()) {
        items.push(this.term());
      } else break;
    }
    return this.deep(sequence(items));
  }

  /** `Primary Postfix*`, each postfix wrapping what is before it. */
  private term(): Draft {
    // A postfix's range starts at its operand's first token: a group's `(` too.
    const start = this.range().start;
    let d = this.primary();
    for (;;) {
      this.tested(POSTFIX);
      const k = this.kind();
      if (!POSTFIX.includes(k)) return d;
      const op = this.range(this.i++);
      if (k === T.Minus) {
        const except = this.primary();
        const range = { start, end: this.range(this.i - 1).end };
        d = sequence([d, leaf('terminal', '-', op), except], range);
      } else {
        const range = { start, end: op.end };
        if (k === T.Question) d = optional(d, range);
        else d = repetition(d, k === T.Plus ? 1 : 0, Infinity, range);
      }
      d = this.deep(d);
    }
  }

  /** `STRING | ID | SPECIAL | '(' Choice ')' | '[' Choice ']' | '\{' Choice '\}'` */
  private primary(): Draft {
    this.startElement(PRIMARY);
    const k = this.kind();
    const j = this.i;
    const range = this.range();
    if (k === T.String) {
      this.i++;
      return leaf(
        'terminal',
        this.written(j, (s) => stringValue('railroadEbnf', s)),
        range
      );
    }
    if (k === T.Id) {
      this.i++;
      const name = this.written(j);
      this.reference(name, range);
      return leaf('nonterminal', name, range);
    }
    if (k === T.Special) {
      this.i++;
      return leaf('special', specialValue(this.raw(j)), range);
    }
    const closer = CLOSER[k];
    if (closer === undefined) this.fail(PRIMARY);
    this.i++;
    const inner = this.nested(range, () => this.choice());
    const close = this.expect(closer);
    if (k === T.LParen) return inner;
    const whole = this.span(j, close);
    return this.deep(
      k === T.LBracket ? optional(inner, whole) : repetition(inner, 0, Infinity, whole)
    );
  }

  protected override characterHint(text: string): string {
    if (text.startsWith('#')) return '; EBNF has no `#` comments: write `(* … *)`';
    return '';
  }
}
