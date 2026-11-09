// cspell:words numval
/**
 * The ABNF parser (`railroad-abnf-beta`): v12's `railroad-abnf.langium` rules and
 * `abnfParser.ts` mapping, over the ABNF lexer's tokens. The shared part (header,
 * `title`/`acc*`, rules, recovery) is `../base.ts`; `grammar/railroad-abnf.ebnf` is the
 * normative form:
 *
 *     Alternation:   Concatenation ('/' Concatenation)*    one alternative is itself
 *     Concatenation: Element+                              one element is itself
 *     Element:       (REPEAT | EXACT_REPEAT)? Primary
 *     Primary:       STRING | NUMVAL | NAME | '(' Alternation ')' | '[' Alternation ']'
 *
 * A repeat `n*m` is a repetition n…m (an empty `n` is 0, an empty `m` unbounded), `n` alone
 * n…n, and 0…1 an optional. Strings keep their text as written (no escapes), and `%x41`
 * values are terminals of their text. `;` ends a rule only at the end of its line: with more
 * text after it, it starts a comment (D513).
 */
import { ExpectedTable, Kind } from '@mermaid-js/core/parser-kit';
import { RailroadParser, RULE_START } from '../base.ts';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { RailroadParseOptions } from '../base.ts';
import { repeatBounds, stringValue } from '../convert.ts';
import { T } from '../tokens.ts';
import { choice, leaf, optional, repetition, sequence } from '../tree.ts';
import type { Draft } from '../tree.ts';

const REPEATS = [T.Repeat, T.ExactRepeat];
const PRIMARY = [T.String, T.NumVal, T.Id, T.LParen, T.LBracket];
const ELEMENT = [...REPEATS, ...PRIMARY];

const EXPECTED = new ExpectedTable([
  ['`railroad-abnf-beta`', [T.Header]],
  ['a rule such as `name = "a" ;`', [RULE_START]],
  ['`=`', [T.Equals]],
  [
    'a string in quotes, such as `"a"`, a value such as `%x41`, or a rule name',
    [T.String, T.NumVal, T.Id],
  ],
  ['a repeat such as `1*` or `2*4`', REPEATS],
  ['a group in `( )` or `[ ]`', [T.LParen, T.LBracket]],
  ['`/` and another alternative', [T.Slash]],
  ['`)`', [T.RParen]],
  ['`]`', [T.RBracket]],
  ['`;` at the end of the rule', [T.Semi]],
  ['the end of the text', [Kind.EOF]],
]);

export class AbnfParser extends RailroadParser {
  protected readonly defines = [T.Equals];
  protected readonly expected = EXPECTED;

  constructor(src: string, options: RailroadParseOptions, computed?: PreprocessResult) {
    super(src, 'railroadAbnf', options, computed);
  }

  protected definition(): Draft {
    return this.alternation();
  }

  /** `Concatenation ('/' Concatenation)*` */
  private alternation(): Draft {
    const items = [this.concatenation()];
    while (this.kind() === T.Slash) {
      this.i++;
      items.push(this.concatenation());
    }
    return this.deep(choice(items));
  }

  /** `Element+`: the elements run on while the next token can start one. */
  private concatenation(): Draft {
    const items = [this.element()];
    for (;;) {
      this.tested([...ELEMENT, T.Slash]);
      if (!ELEMENT.includes(this.kind()) || this.startsRule()) break;
      items.push(this.element());
    }
    return this.deep(sequence(items));
  }

  /** `(REPEAT | EXACT_REPEAT)? Primary` */
  private element(): Draft {
    this.tested(ELEMENT);
    if (!REPEATS.includes(this.kind())) return this.primary();
    const r = this.i++;
    const inner = this.primary();
    const { min, max } = repeatBounds(this.raw(r));
    const range = this.span(r, this.i - 1);
    if (min === 0 && max === 1) return this.deep(optional(inner, range));
    return this.deep(repetition(inner, min, max, range));
  }

  /** `STRING | NUMVAL | NAME | '(' Alternation ')' | '[' Alternation ']'` */
  private primary(): Draft {
    this.tested(PRIMARY);
    const k = this.kind();
    const j = this.i;
    const range = this.range();
    if (k === T.String || k === T.NumVal) {
      this.i++;
      const raw = this.raw(j);
      return leaf('terminal', k === T.String ? stringValue('railroadAbnf', raw) : raw, range);
    }
    if (k === T.Id) {
      this.i++;
      const name = this.raw(j);
      this.reference(name, range);
      return leaf('nonterminal', name, range);
    }
    if (k !== T.LParen && k !== T.LBracket) this.fail(PRIMARY);
    this.i++;
    const inner = this.nested(range, () => this.alternation());
    const close = this.expect(k === T.LParen ? T.RParen : T.RBracket);
    if (k === T.LParen) return inner;
    return this.deep(optional(inner, this.span(j, close)));
  }

  protected override explain(want: readonly number[]): string | undefined {
    if (want.includes(T.Semi) && this.commentBefore()) {
      return 'in ABNF a `;` followed by more text on its line starts a comment, so end each rule with `;` at the end of its line';
    }
    return super.explain(want);
  }

  /** Whether a `;` comment is the last token before the current one. */
  private commentBefore(): boolean {
    const at = this.range().start;
    const { full } = this;
    // The first token of the whole stream that starts at or after `at`, by bisection.
    let lo = 0;
    let hi = full.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((full.start[mid] ?? 0) < at) lo = mid + 1;
      else hi = mid;
    }
    return lo > 0 && full.kind[lo - 1] === T.SemiComment;
  }

  protected override characterHint(text: string): string {
    if (text.startsWith('_')) return '; an ABNF rule name has letters, digits and `-` only';
    if (text.startsWith("'")) return '; ABNF strings are written in double quotes';
    if (text.startsWith('<')) return '; ABNF prose values (`<…>`) are not supported';
    return '';
  }
}
