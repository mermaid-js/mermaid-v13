// cspell:words accdescr
/**
 * Packet parser: recursive descent over the significant {@link lex} tokens (gated against v12's
 * Langium lexer, #452), producing a {@link PacketModel}, the typed AST, symbols, statement spans
 * and diagnostics (DESIGN §4.2).
 *
 * The grammar is v12's `packet.langium` (with `common.langium`), ported rule for rule;
 * `grammar/packet.ebnf` is the normative form:
 *
 *     Packet: NEWLINE* ("packet" | "packet-beta") (TitleAndAccessibilities | PacketBlock | NEWLINE)*
 *     PacketBlock: (INT ("-" INT)? | "+" INT) ":" STRING EOL
 *     TitleAndAccessibilities: ((ACC_DESCR | ACC_TITLE | TITLE) EOL)+
 *     EOL: NEWLINE+ | EOF
 *
 * so it accepts and rejects what v12's parser does. Unlike v12 it does not stop at the first
 * error: it reports it, skips to the next line break and carries on (R-PARSE-4). The checks v12's
 * `populate` threw on (a reversed range, a gap or overlap, `+0`) are error diagnostics with v12's
 * messages (D341), and counting resumes after the field, so one misplaced field gives one error.
 * Fields are split into rows as v12 split them, up to its 10,000-row cap (D342).
 */
import { checkLimit } from '@mermaid-js/core/limits';
import { ExpectedTable, Kind, kindSet } from '@mermaid-js/core/parser-kit';
import { STOP } from '@mermaid-js/shared/parser/support';
import {
  RuleParser,
  textProbeMode,
  textStatements,
  unclosedLabel,
  unreadAccessibility,
} from '@mermaid-js/shared/parser/rule';
import type { ParseOptions, ParseResult, Range } from '@mermaid-js/core/parser-kit';
import type { RuleGrammar, TextValues } from '@mermaid-js/shared/parser/rule';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import { packetConfig } from '../config.ts';
import type { PacketField, PacketModel } from '../model.ts';
import { MAX_PACKET_ROWS, RowSplitter } from '../normalise.ts';
import type { PacketDocument, PacketFieldDrop, PacketStatementNode } from './ast.ts';
import { labelValue } from './convert.ts';
import { lex } from './lexer.ts';
import { PACKET_TRIVIA, T } from './tokens.ts';

export interface PacketParseOptions extends ParseOptions {
  /**
   * The resolved `packet` config section (`ctx.config.packet`): rows are split at
   * `bitsPerRow`, and invalid lengths fall back with a warning (D342). Defaults when absent.
   */
  config?: Readonly<Record<string, unknown>>;
  /** The integrator's cap on fields (core `DEFAULT_LIMITS.maxNodes` when absent, R-SEC-5). */
  maxNodes?: number;
}

export type PacketParseResult = ParseResult<PacketModel, PacketDocument>;

/** The codes of the checks v12's `populate` threw on (D341): semantic, not syntax, errors. */
export const PACKET_SEMANTIC_ERRORS: readonly string[] = [
  'PACKET_END_BEFORE_START',
  'PACKET_NOT_CONTIGUOUS',
  'PACKET_ZERO_BITS',
];

const HEADERS = [T.Packet, T.PacketBeta];
const TEXT = [T.Title, T.AccTitle, T.AccDescr];
const FIELD = [T.Int, T.Plus];
const STATEMENT = [...FIELD, ...TEXT];
const DOC = [...STATEMENT, Kind.Newline, Kind.EOF];
const HEAD = [...HEADERS, Kind.Newline];
const AFTER_START = [T.Dash, T.Colon];

/**
 * Kinds a probe's cursor follows rather than extends: `:`, `+` and `-` (right after them the
 * parser expects a label or a bit number), and a label, which its closing quote ends (right
 * after `"Data"` the parser expects a line break).
 */
const PROBE_FOLLOWS = kindSet(T.Colon, T.Plus, T.Dash, T.String);

/** `title`, `accTitle` and `accDescr` by token kind. */
const TEXTS = /* @__PURE__ */ textStatements(T.Title, T.AccTitle, T.AccDescr);

/** Human names for what the parser expects inside a statement (R-ERR-2, R-ERR-5). */
const EXPECTED = new ExpectedTable([
  ['`packet`', HEADERS],
  ['a bit number such as `16`', [T.Int]],
  ['`-` and the last bit', [T.Dash]],
  ['`+` and a number of bits', [T.Plus]],
  ['`:` and a label', [T.Colon]],
  ['a label in quotes, such as `"Source Port"`', [T.String]],
  ['`title`, `accTitle:` or `accDescr`', TEXT],
  ['a line break', [Kind.Newline]],
  ['the end of the text', [Kind.EOF]],
]);

/** Human names for what may start a line. */
const EXPECTED_LINE = new ExpectedTable([
  ['`packet`', HEADERS],
  ['a field such as `0-15: "Source Port"` or `+16: "Data"`', FIELD],
  ['`title`, `accTitle:` or `accDescr`', TEXT],
  ['a line break', [Kind.Newline]],
  ['the end of the text', [Kind.EOF]],
]);

const ONE_PER_LINE = 'put each field and statement on a line of its own';
const FIELD_FORM = 'write a field as `0-15: "label"`, `16: "label"` or `+8: "label"`';

/** A field's bits as written: `start-end`, `start` or `+bits`, and where. */
interface WrittenBits {
  start?: number;
  end?: number;
  bits?: number;
  range: Range;
}

/** A field's range after v12's checks, and the check that failed, if one did (D341). */
interface Resolved {
  start: number;
  end: number;
  error?: PacketFieldDrop;
}

/** Parse a packet diagram. Never throws: problems are error diagnostics. */
export function parsePacket(src: string, options: PacketParseOptions = {}): PacketParseResult {
  return new PacketParser(src, options).parse();
}

const GRAMMAR: RuleGrammar = {
  lex,
  trivia: PACKET_TRIVIA,
  probeFollows: PROBE_FOLLOWS,
  probeMode: /* @__PURE__ */ textProbeMode({
    texts: TEXTS,
    accDescr: T.AccDescr,
    string: T.String,
  }),
  expected: EXPECTED,
  statements: STATEMENT,
  onePerLine: ONE_PER_LINE,
};

/**
 * One parse. Each grammar rule is a method that returns what it read; a rule that fails
 * records a diagnostic and throws {@link STOP}, and the statement loop recovers.
 */
class PacketParser extends RuleParser<PreprocessResult> {
  private readonly children: PacketStatementNode[] = [];
  private readonly bitsPerRow: number;
  /** v12's `lastBit`: the last bit of the fields so far. */
  private lastBit = -1;
  private readonly rows: RowSplitter;
  /** The last in-text value of each (v12's Langium assignments: the last one wins). */
  private readonly texts: TextValues = { title: '', accTitle: '', accDescr: '' };

  constructor(
    src: string,
    private readonly options: PacketParseOptions
  ) {
    const given = options.preprocessed;
    super(src, given ?? preprocess(src), !given, GRAMMAR, options.probe);
    const { config, problems } = packetConfig(options.config);
    this.bitsPerRow = config.bitsPerRow;
    this.rows = new RowSplitter(config.bitsPerRow);
    const at = { start: this.pre.bodyStart, end: this.pre.bodyStart };
    for (const p of problems) this.st.diagnostics.warning('PACKET_CONFIG_INVALID', p.message, at);
  }

  /** The field statements so far, for the integrator's cap. */
  private fieldCount = 0;

  parse(): PacketParseResult {
    this.statement(() => this.header());
    this.document();
    const fields = {
      fields: Object.freeze(this.rows.fields),
      rows: Object.freeze(this.rows.rows()),
      bitsPerRow: this.bitsPerRow,
    };
    return this.finish(fields, this.texts, this.children, this.options);
  }

  // ---- tokens -------------------------------------------------------------------------

  private span(from: number, to: number): Range {
    return { start: this.range(from).start, end: this.range(to).end };
  }

  // ---- errors and recovery ------------------------------------------------------------

  /**
   * Text no token rule matched: an unclosed string or `accDescr {`, an unquoted label, or stray
   * characters. `want` is what the parser expected there.
   */
  protected override unmatched(where: Range, want: readonly number[]): never {
    const { st } = this;
    const text = this.raw();
    const line = this.lineOf(where.start);
    if (unclosedLabel(st.diagnostics, text, line, where)) throw STOP;
    if (unreadAccessibility(st.diagnostics, text, line, where)) throw STOP;
    const shown = text.length > 24 ? `${text.slice(0, 24)}…` : text;
    let why = '';
    if (want.includes(T.String)) why = '; a label goes in quotes, such as `"Source Port"`';
    else if (want.includes(T.Colon)) why = `; ${FIELD_FORM}`;
    else if (want.includes(T.Packet)) why = '; a diagram starts with `packet` or `packet-beta`';
    else if (text === ';') {
      why = `; \`;\` does not end a statement in a packet diagram: ${ONE_PER_LINE}`;
    } else if (/^[0-9]/.test(text)) why = '; a bit number is a whole number such as `16`';
    st.diagnostics.error('UNEXPECTED_CHARACTER', `Unexpected character \`${shown}\`${why}.`, where);
    throw STOP;
  }

  protected override failHint(): string | undefined {
    const k = this.kind();
    if (HEADERS.includes(k)) return 'a diagram has one `packet`, at its start';
    if (STATEMENT.includes(k)) return ONE_PER_LINE;
    if (k === T.String || k === T.Colon || k === T.Dash) return FIELD_FORM;
    return undefined;
  }

  // ---- rules --------------------------------------------------------------------------

  /** `NEWLINE* ("packet" | "packet-beta")` */
  private header(): void {
    for (;;) {
      this.tested(HEAD);
      if (this.kind() !== Kind.Newline) break;
      this.i++;
    }
    const k = this.kind();
    if (!HEADERS.includes(k)) this.fail(HEADERS);
    const range = this.range(this.i++);
    this.st.statement('header', range);
    this.children.push({ id: 'packet', type: 'Header', range, beta: k === T.PacketBeta });
  }

  /**
   * `(TitleAndAccessibilities | PacketBlock | NEWLINE)* EOF`. `restart` is whether the count
   * restarts at the next field: after a field whose bits could not be read, so one broken field
   * gives one error (R-PARSE-4, pitfall 8). A text statement or a stray line leaves it as it is,
   * so a gap after stray text is still reported.
   */
  private document(): void {
    let restart = false;
    for (;;) {
      this.tested(DOC);
      const k = this.kind();
      if (k === Kind.EOF) return;
      if (k === Kind.Newline) {
        this.i++;
        continue;
      }
      if (FIELD.includes(k) || this.startsLikeBits()) {
        restart = this.fieldStatement(restart);
        continue;
      }
      const text = TEXTS[k];
      this.statement(() => {
        if (text) this.textStatement(text, this.texts, this.children);
        else this.unexpected(DOC, undefined, EXPECTED_LINE.names(DOC));
      });
    }
  }

  /** Text no rule took that starts with a digit (`8.5: "a"`): a field whose bits are broken. */
  private startsLikeBits(): boolean {
    return this.kind() === Kind.Error && /^[0-9]/.test(this.raw());
  }

  /**
   * One field, recovering on failure. Returns whether the count restarts at the next field:
   * true when this field's bits could not be read.
   */
  private fieldStatement(restart: boolean): boolean {
    let read = false;
    try {
      if (this.kind() === Kind.Error) this.fail(FIELD);
      const bits = this.bits();
      read = true;
      this.field(bits, restart);
    } catch (error) {
      if (error !== STOP) throw error;
      this.recover();
    }
    return !read;
  }

  /** `INT ("-" INT)? | "+" INT`: a field's bits, as written. */
  private bits(): WrittenBits {
    const first = this.i;
    if (this.kind() === T.Plus) {
      this.i++;
      const n = this.expect(T.Int, FIELD_FORM);
      return { bits: Number(this.raw(n)), range: this.span(first, n) };
    }
    const s = this.i++;
    const start = Number(this.raw(s));
    this.tested(AFTER_START);
    if (this.kind() === T.Int) {
      this.fail(AFTER_START, 'a bit number has no leading zeros, and a range is written `0-15`');
    }
    if (this.kind() !== T.Dash) return { start, range: this.range(s) };
    this.i++;
    const e = this.expect(T.Int, FIELD_FORM);
    return { start, end: Number(this.raw(e)), range: this.span(first, e) };
  }

  /**
   * `PacketBlock: bits ":" STRING EOL`, after its bits. They are checked first, so a later
   * syntax error in the field still moves the count on; `restart` as in {@link document}.
   */
  private field(written: WrittenBits, restart: boolean): void {
    const { start, end, error } = this.resolve(written, restart);
    this.expect(T.Colon, FIELD_FORM);
    const s = this.expect(T.String);
    const labelRange = this.range(s);
    const label = labelValue(this.raw(s));
    const range = { start: written.range.start, end: labelRange.end };
    const astId = this.id(`field:${start}-${end}`);
    let dropped = error;
    if (!dropped && !this.place({ start, end, bits: end - start + 1, label, astId }, range))
      dropped = { reason: 'rowCap' };
    this.children.push({
      id: astId,
      type: 'Field',
      range,
      start,
      end,
      label,
      labelRange,
      bitsRange: written.range,
      ...(dropped ? { dropped } : {}),
    });
    this.st.statement('field', range);
    checkLimit(
      this.st.diagnostics,
      'maxNodes',
      ++this.fieldCount,
      this.options.maxNodes,
      'fields',
      range
    );
    // D346: each label is a `field` symbol of its own; repeated labels are separate fields.
    this.st.symbol(label, 'field', labelRange, 'def');
    this.lineEnd();
  }

  /**
   * v12's `populate` checks, in its order, each an error with v12's message (D341). Returns the
   * resolved range, and moves `lastBit` on: to the field's end, a reversed field's start, or
   * nowhere for `+0`.
   */
  private resolve(written: WrittenBits, restart: boolean): Resolved {
    const where = written.range;
    const { start: s, end: e } = written;
    /** Report the failed check at the bits as written, and give it to the field's node. */
    const failed = (code: string, message: string): PacketFieldDrop => {
      this.st.diagnostics.error(code, message, where);
      return { reason: 'error', code, message };
    };
    if (s !== undefined && e !== undefined && e < s) {
      const error = failed(
        'PACKET_END_BEFORE_START',
        `Packet block ${s} - ${e} is invalid. End must be greater than start.`
      );
      this.lastBit = s;
      return { start: s, end: e, error };
    }
    // After a field whose bits could not be read, counting restarts here.
    const next = restart && s !== undefined ? s : this.lastBit + 1;
    const start = s ?? next;
    const end = e ?? start + (written.bits ?? 1) - 1;
    if (written.bits === 0) {
      const error = failed(
        'PACKET_ZERO_BITS',
        `Packet block ${start} is invalid. Cannot have a zero bit field.`
      );
      return { start, end, error };
    }
    this.lastBit = end;
    if (start === next) return { start, end };
    const error = failed(
      'PACKET_NOT_CONTIGUOUS',
      `Packet block ${start} - ${e ?? start} is not contiguous. It should start from ${next}.`
    );
    return { start, end, error };
  }

  /**
   * Split `field` into rows (`normalise.ts`); the first field the cap cuts warns (D342).
   * Returns whether any of it is drawn: false when it lies wholly past the cap.
   */
  private place(field: PacketField, range: Range): boolean {
    const before = this.rows.fields.length;
    const dropped = this.rows.add(field);
    if (dropped !== undefined) {
      this.st.diagnostics.warning(
        'PACKET_TRUNCATED',
        `The packet has more than ${MAX_PACKET_ROWS} rows: bit ${dropped} and the bits after it are not drawn.`,
        range
      );
    }
    return this.rows.fields.length > before;
  }
}
