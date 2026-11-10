/**
 * The PEG parser (`railroad-peg-beta`): v12's `railroad-peg.langium` rules and `pegParser.ts`
 * mapping, over the PEG lexer's tokens. The shared part (header, `title`/`acc*`, rules,
 * recovery) is `../parser.ts`; `grammar/railroad-peg.ebnf` is the normative form:
 *
 *     OrderedChoice: Sequence ('/' Sequence)*        one alternative is itself
 *     Sequence:      Prefix+                         one element is itself
 *     Prefix:        ('&' | '!')? Suffix             a predicate is a special, `&X` / `!X`
 *     Suffix:        Primary ('?' | '*' | '+')?      optional, 0…∞, 1…∞
 *     Primary:       STRING | ID | '(' OrderedChoice ')' | '.'
 *
 * A predicate's special is labelled with its operand as v12's `nodeToLabel` wrote it: a
 * terminal in double quotes, a nonterminal's name, a special's text, anything else `(...)`.
 * `.` is the special `.`. At most one prefix and one suffix (`!!x` and `x?*` are errors).
 */
import { ExpectedTable, Kind } from '@mermaid-js/core/parser-kit';
import { RailroadParser, RULE_START } from '../parser.ts';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { RailroadParseOptions } from '../parser.ts';
import { stringValue } from '../convert.ts';
import { T } from '../tokens.ts';
import { choice, leaf, optional, repetition, sequence } from '../tree.ts';
import type { Draft } from '../tree.ts';

const PRIMARY = [T.String, T.Id, T.LParen, T.Dot];
const PREDICATES = [T.Amp, T.Bang];
const PREFIX = [...PREDICATES, ...PRIMARY];
const AFTER_PREFIX = [...PREFIX, T.Slash];
const SUFFIX = [T.Question, T.Star, T.Plus];

const EXPECTED = new ExpectedTable([
  ['`railroad-peg-beta`', [T.Header]],
  ['a rule such as `Name <- "a" ;`', [RULE_START]],
  ['`<-`', [T.Arrow]],
  ['a string in quotes, such as `"a"`, a rule name or `.`', [T.String, T.Id, T.Dot]],
  ['a group in `( )`', [T.LParen]],
  ['`&` or `!` before an element', PREDICATES],
  ['`?`, `*` or `+` after an element', SUFFIX],
  ['`/` and another alternative', [T.Slash]],
  ['`)`', [T.RParen]],
  ['`;` at the end of the rule', [T.Semi]],
  ['the end of the text', [Kind.EOF]],
]);

/** v12's `nodeToLabel`: how a predicate's special names its operand. */
function label(d: Draft): string {
  if (d.type === 'terminal') return `"${d.text}"`;
  if (d.type === 'nonterminal' || d.type === 'special') return d.text;
  return '(...)';
}

export class PegParser extends RailroadParser {
  protected readonly defines = [T.Arrow];
  protected readonly expected = EXPECTED;

  constructor(src: string, options: RailroadParseOptions, computed?: PreprocessResult) {
    super(src, 'railroadPeg', options, computed);
  }

  protected definition(): Draft {
    return this.orderedChoice();
  }

  /** `Sequence ('/' Sequence)*` */
  private orderedChoice(): Draft {
    const items = [this.sequence()];
    while (this.kind() === T.Slash) {
      this.i++;
      items.push(this.sequence());
    }
    return this.deep(choice(items));
  }

  /** `Prefix+`: the elements run on while the next token can start one. */
  private sequence(): Draft {
    const items = [this.prefix()];
    for (;;) {
      this.tested(AFTER_PREFIX);
      if (!PREFIX.includes(this.kind()) || this.startsRule()) break;
      items.push(this.prefix());
    }
    return this.deep(sequence(items));
  }

  /** `('&' | '!')? Suffix`: a predicate drops its operand for a labelled special. */
  private prefix(): Draft {
    this.startElement(PREFIX);
    const k = this.kind();
    if (!PREDICATES.includes(k)) return this.suffix();
    const op = this.range(this.i++);
    const inner = this.suffix();
    const text = (k === T.Amp ? '&' : '!') + label(inner);
    return leaf('special', text, { start: op.start, end: this.range(this.i - 1).end });
  }

  /** `Primary ('?' | '*' | '+')?` */
  private suffix(): Draft {
    const start = this.range().start;
    const inner = this.primary();
    this.tested(SUFFIX);
    const k = this.kind();
    if (!SUFFIX.includes(k)) return inner;
    const range = { start, end: this.range(this.i++).end };
    if (k === T.Question) return this.deep(optional(inner, range));
    return this.deep(repetition(inner, k === T.Plus ? 1 : 0, Infinity, range));
  }

  /** `STRING | ID | '(' OrderedChoice ')' | '.'` */
  private primary(): Draft {
    this.startElement(PRIMARY);
    const k = this.kind();
    const j = this.i;
    const range = this.range();
    if (k === T.String) {
      this.i++;
      return leaf('terminal', stringValue('railroadPeg', this.raw(j)), range);
    }
    if (k === T.Id) {
      this.i++;
      const name = this.raw(j);
      this.reference(name, range);
      return leaf('nonterminal', name, range);
    }
    if (k === T.Dot) {
      this.i++;
      return leaf('special', '.', range);
    }
    if (k !== T.LParen) this.fail(PRIMARY);
    this.i++;
    const inner = this.nested(range, () => this.orderedChoice());
    this.expect(T.RParen);
    return inner;
  }

  protected override explain(want: readonly number[]): string | undefined {
    const k = this.kind();
    if (want.includes(T.String) && PREDICATES.includes(k)) {
      return 'an element takes at most one `&` or `!`';
    }
    if (want.includes(T.Semi) && SUFFIX.includes(k)) {
      return 'an element takes at most one `?`, `*` or `+`';
    }
    if (k === T.Equals && want.includes(T.Arrow)) return 'a PEG rule is written `Name <- … ;`';
    return super.explain(want);
  }

  protected override characterHint(text: string): string {
    if (text.startsWith('[')) return '; PEG character classes (`[a-z]`) are not supported';
    if (text.startsWith('=')) return '; a PEG rule is written `Name <- … ;`';
    return '';
  }
}
