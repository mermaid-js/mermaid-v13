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
import {
  APOSTROPHE,
  cook,
  DQUOTE,
  ExpectedTable,
  Kind,
  kindSet,
  LineIndex,
  ParseState,
  Probe,
  significantTokens,
  skipTo,
  sourceView,
} from '@mermaid-js/core/parser-kit';
import type {
  AstId,
  ParseOptions,
  ParseResult,
  Range,
  SourceView,
  TokenStream,
  TokenView,
} from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import { packetConfig } from '../config.ts';
import type { PacketField, PacketModel } from '../model.ts';
import { MAX_PACKET_ROWS, RowSplitter } from '../normalise.ts';
import type { PacketDocument, PacketStatementNode, PacketTextNode } from './ast.ts';
import { accDescrValue, accTitleValue, labelValue, titleValue } from './convert.ts';
import { lex } from './lexer.ts';
import { PACKET_TRIVIA, T } from './tokens.ts';

export interface PacketParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
  /**
   * The resolved `packet` config section (`ctx.config.packet`): rows are split at
   * `bitsPerRow`, and invalid lengths fall back with a warning (D342). Defaults when absent.
   */
  config?: Readonly<Record<string, unknown>>;
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
const LINE_END = [Kind.Newline, Kind.EOF];
const HEAD = [...HEADERS, Kind.Newline];
const AFTER_START = [T.Dash, T.Colon];

/** Where recovery resumes (R-PARSE-4). */
const BOUNDARY = kindSet(Kind.Newline, Kind.EOF);
/**
 * Kinds a probe's cursor follows rather than extends: `:`, and a label, which its closing quote
 * ends (right after `"Data"` the parser expects a line break).
 */
const PROBE_FOLLOWS = kindSet(T.Colon, T.String);

/** The keyword of each statement-value token, also its probe mode ({@link probeMode}). */
const VALUE_WORDS: Readonly<Record<number, string>> = {
  [T.Title]: 'title',
  [T.AccTitle]: 'accTitle',
  [T.AccDescr]: 'accDescr',
};

/**
 * The probe's mode at `o` (R-LANG-7). The lexer has no modes (Langium's has none), so the
 * mode names what the offset is in: `title`, `accTitle` or `accDescr` past the keyword of
 * that statement, `string` inside a label (closed or not), else `INITIAL` (code).
 */
function probeMode(src: string, tokens: TokenStream, o: number): string {
  for (let j = 0; j < tokens.length; j++) {
    const start = tokens.start[j] ?? 0;
    const end = tokens.end[j] ?? 0;
    if (start >= o) break;
    if (end < o) continue;
    const kind = tokens.kind[j] ?? Kind.EOF;
    const c = src.charCodeAt(start);
    if (kind === T.String && o < end) return 'string';
    // An unclosed label is an error token from its quote to the line end.
    if (kind === Kind.Error && (c === DQUOTE || c === APOSTROPHE)) return 'string';
    const word = VALUE_WORDS[kind];
    if (!word) continue;
    let k = start;
    while (/[\t ]/.test(src.charAt(k))) k++;
    k += word.length;
    // A block `accDescr { … }` ends at its `}`; the other values run to the line end.
    const block = kind === T.AccDescr && /^\s*\{/.test(src.slice(k, end));
    if (o > k && (o < end || !block)) return word;
  }
  return 'INITIAL';
}

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

const KIND_OF: Record<number, PacketTextNode['type']> = {
  [T.Title]: 'Title',
  [T.AccTitle]: 'AccTitle',
  [T.AccDescr]: 'AccDescr',
};
const ID_OF: Record<PacketTextNode['type'], string> = {
  Title: 'title',
  AccTitle: 'accTitle',
  AccDescr: 'accDescr',
};
const ONE_PER_LINE = 'put each field and statement on a line of its own';
const FIELD_FORM = 'write a field as `0-15: "label"`, `16: "label"` or `+8: "label"`';

/**
 * Thrown inside the parser after a diagnostic is recorded; caught at statement level. One
 * instance, so its stack is captured once.
 */
class Stop extends Error {}
const STOP = new Stop();

/** A field's bits as written: `start-end`, `start` or `+bits`, and where. */
interface WrittenBits {
  start?: number;
  end?: number;
  bits?: number;
  range: Range;
}

/** A field's range after v12's checks; `ok` is false when one failed (D341). */
interface Resolved {
  start: number;
  end: number;
  ok: boolean;
}

/** Parse a packet diagram. Never throws: problems are error diagnostics. */
export function parsePacket(src: string, options: PacketParseOptions = {}): PacketParseResult {
  return new PacketParser(src, options).parse();
}

/**
 * One parse. Each grammar rule is a method that returns what it read; a rule that fails
 * records a diagnostic and throws {@link STOP}, and the statement loop recovers.
 */
class PacketParser {
  private readonly pre: PreprocessResult;
  private readonly view: SourceView;
  private readonly full: TokenStream;
  private readonly t: TokenView;
  private i = 0;
  private readonly st = new ParseState();
  private readonly probe: Probe | undefined;
  private readonly children: PacketStatementNode[] = [];
  private lines: LineIndex | undefined;
  /** Mentions per id base (`field:0-15`, `title`, …), for the `@n` suffixes. */
  private readonly mentions = new Map<string, number>();
  private readonly bitsPerRow: number;
  /** v12's `lastBit`: the last bit of the fields so far. */
  private lastBit = -1;
  private readonly rows: RowSplitter;
  /** The last in-text value of each (v12's Langium assignments: the last one wins). */
  private title = '';
  private accTitle = '';
  private accDescr = '';

  constructor(
    private readonly src: string,
    private readonly options: PacketParseOptions
  ) {
    const pre = (this.pre = options.preprocessed ?? preprocess(src));
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    this.view = sourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    this.full = lex(src, pre.bodyStart, this.view);
    this.t = significantTokens(this.full, PACKET_TRIVIA);
    const { config, problems } = packetConfig(options.config);
    this.bitsPerRow = config.bitsPerRow;
    this.rows = new RowSplitter(config.bitsPerRow);
    // D342: the config applies to the whole diagram; the warning points at its start.
    const at = { start: pre.bodyStart, end: pre.bodyStart };
    for (const p of problems) this.st.diagnostics.warning('PACKET_CONFIG_INVALID', p.message, at);
    if (options.probe !== undefined) {
      const probe = (this.probe = new Probe(src, options.probe, PROBE_FOLLOWS));
      if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
      else probe.trivia(this.full);
      // Ignored when the offset is outside code.
      probe.lexed(probe.offset, probe.offset, probeMode(src, this.full, probe.offset));
    }
  }

  parse(): PacketParseResult {
    const { st, src } = this;
    this.statement(() => this.header());
    this.document();
    const warnings = st.diagnostics.list.filter((d) => d.severity === 'warning');
    // D218: the in-text title if non-empty, else the front-matter one.
    const title = this.title || this.pre.frontMatter?.title;
    const model: PacketModel = Object.freeze({
      fields: Object.freeze(this.rows.fields),
      rows: Object.freeze(this.rows.rows()),
      bitsPerRow: this.bitsPerRow,
      ...(title ? { title } : {}),
      accTitle: this.accTitle,
      accDescr: this.accDescr,
      warnings: Object.freeze(warnings),
    });
    const ast: PacketDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: this.pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, this.full, this.options, this.probe);
  }

  // ---- tokens -------------------------------------------------------------------------

  private kind(j = this.i): number {
    return this.t.kind[j] ?? Kind.EOF;
  }

  private range(j = this.i): Range {
    return { start: this.t.start[j] ?? 0, end: this.t.end[j] ?? 0 };
  }

  private span(from: number, to: number): Range {
    return { start: this.range(from).start, end: this.range(to).end };
  }

  /** A token's text as v12's lexer read it (removed spans dropped, entities decoded). */
  private raw(j = this.i): string {
    const { start, end } = this.range(j);
    return cook(this.src, start, end, this.view);
  }

  /**
   * Probe hook: the parser tests the current token for `kinds` (a constant list), or would
   * accept them there. Records them when it is the probed token.
   */
  private tested(kinds: readonly number[]): void {
    const p = this.probe;
    if (p?.isAt(this.t, this.i, this.pre.bodyStart)) p.tested(kinds, this.range().start);
  }

  /** Consume a token of `kind` and return its index, or fail. */
  private expect(kind: number, hint?: string): number {
    this.tested([kind]);
    if (this.kind() !== kind) this.fail([kind], hint);
    return this.i++;
  }

  /** `id`, then `id@2`, `id@3`, … */
  private id(base: string): AstId {
    const n = (this.mentions.get(base) ?? 0) + 1;
    this.mentions.set(base, n);
    return n === 1 ? base : `${base}@${n}`;
  }

  // ---- errors and recovery ------------------------------------------------------------

  private lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  /** How an error message names the current token. */
  private found(): string {
    const k = this.kind();
    if (k === Kind.EOF) return 'the end of the text';
    if (k === Kind.Newline) return 'a line break';
    const text = this.raw().trim();
    const line = text.split('\n', 1)[0] ?? '';
    return line.length > 24 || line !== text ? `\`${line.slice(0, 24)}…\`` : `\`${line}\``;
  }

  /** Report what was found where one of `want` was expected, then stop the statement. */
  private fail(want: readonly number[], hint?: string, table = EXPECTED): never {
    const { st } = this;
    const where = this.range();
    if (this.kind() === Kind.Error) this.badCharacters(where, want);
    const d = st.diagnostics.unexpected('UNEXPECTED', where, table.names(want), this.found());
    const why = hint ?? this.explain();
    if (why) d.message = `${d.message.slice(0, -1)}; ${why}.`;
    throw STOP;
  }

  /**
   * Text no token rule matched: an unclosed string or `accDescr {`, an unquoted label, or stray
   * characters. `want` is what the parser expected there.
   */
  private badCharacters(where: Range, want: readonly number[]): never {
    const { st } = this;
    const text = this.raw();
    const line = this.lineOf(where.start);
    if (text.startsWith('"') || text.startsWith("'")) {
      const q = text[0] ?? '"';
      st.diagnostics.error(
        'UNCLOSED_STRING',
        `Unclosed label: the \`${q}\` at line ${line} has no closing \`${q}\`. Add \`${q}\` after the label.`,
        where,
        { expected: [`\`${q}\``] }
      );
      throw STOP;
    }
    const word = /^[\t ]*(accDescr|accTitle)/.exec(text)?.[1];
    if (word === 'accDescr') {
      st.diagnostics.error(
        'UNCLOSED_ACC_DESCR',
        `Unclosed accessible description: the \`accDescr {\` at line ${line} has no closing \`}\`, and \`accDescr\` without \`{\` takes a \`:\`. Write \`accDescr: …\` or \`accDescr { … }\`.`,
        where
      );
      throw STOP;
    }
    if (word === 'accTitle') {
      st.diagnostics.error(
        'UNEXPECTED_CHARACTER',
        'Expected `:` after `accTitle`; write it as `accTitle: …`.',
        where,
        { expected: ['`:`'] }
      );
      throw STOP;
    }
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

  private explain(): string | undefined {
    const k = this.kind();
    if (HEADERS.includes(k)) return 'a diagram has one `packet`, at its start';
    if (STATEMENT.includes(k)) return ONE_PER_LINE;
    if (k === T.String || k === T.Colon || k === T.Dash) return FIELD_FORM;
    return undefined;
  }

  /** Skip to the next line break after an error (R-PARSE-4). */
  private recover(): void {
    this.probe?.freeze();
    this.i = skipTo(this.t, this.i, BOUNDARY);
  }

  /** Run one statement rule; on failure, recover. */
  private statement(rule: () => void): void {
    try {
      rule();
    } catch (error) {
      if (error !== STOP) throw error;
      this.recover();
    }
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
      this.statement(() => {
        if (TEXT.includes(k)) this.text(k);
        else this.fail(DOC, undefined, EXPECTED_LINE);
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

  /** `EOL: NEWLINE+ | EOF` (the loop takes the line breaks after the first). */
  private eol(): void {
    this.tested(LINE_END);
    const k = this.kind();
    if (k === Kind.EOF) return;
    if (k !== Kind.Newline) this.fail(LINE_END, STATEMENT.includes(k) ? ONE_PER_LINE : undefined);
    this.i++;
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
    const { start, end, ok } = this.resolve(written, restart);
    this.expect(T.Colon, FIELD_FORM);
    const s = this.expect(T.String);
    const labelRange = this.range(s);
    const label = labelValue(this.raw(s));
    const range = { start: written.range.start, end: labelRange.end };
    const astId = this.id(`field:${start}-${end}`);
    this.children.push({
      id: astId,
      type: 'Field',
      range,
      start,
      end,
      label,
      labelRange,
      bitsRange: written.range,
    });
    this.st.statement('field', range);
    // D346: each label is a `field` symbol of its own; repeated labels are separate fields.
    this.st.symbol(label, 'field', labelRange, 'def');
    if (ok) this.place({ start, end, bits: end - start + 1, label, astId }, range);
    this.eol();
  }

  /**
   * v12's `populate` checks, in its order, each an error with v12's message (D341). Returns the
   * resolved range, and moves `lastBit` on: to the field's end, a reversed field's start, or
   * nowhere for `+0`.
   */
  private resolve(written: WrittenBits, restart: boolean): Resolved {
    const { diagnostics } = this.st;
    const where = written.range;
    const { start: s, end: e } = written;
    if (s !== undefined && e !== undefined && e < s) {
      diagnostics.error(
        'PACKET_END_BEFORE_START',
        `Packet block ${s} - ${e} is invalid. End must be greater than start.`,
        where
      );
      this.lastBit = s;
      return { start: s, end: e, ok: false };
    }
    // After a field whose bits could not be read, counting restarts here.
    const next = restart && s !== undefined ? s : this.lastBit + 1;
    const start = s ?? next;
    const end = e ?? start + (written.bits ?? 1) - 1;
    if (written.bits === 0) {
      diagnostics.error(
        'PACKET_ZERO_BITS',
        `Packet block ${start} is invalid. Cannot have a zero bit field.`,
        where
      );
      return { start, end, ok: false };
    }
    this.lastBit = end;
    if (start === next) return { start, end, ok: true };
    diagnostics.error(
      'PACKET_NOT_CONTIGUOUS',
      `Packet block ${start} - ${e ?? start} is not contiguous. It should start from ${next}.`,
      where
    );
    return { start, end, ok: false };
  }

  /** Split `field` into rows (`normalise.ts`); the first field the cap cuts warns (D342). */
  private place(field: PacketField, range: Range): void {
    const dropped = this.rows.add(field);
    if (dropped === undefined) return;
    this.st.diagnostics.warning(
      'PACKET_TRUNCATED',
      `The packet has more than ${MAX_PACKET_ROWS} rows: bit ${dropped} and the bits after it are not drawn.`,
      range
    );
  }

  /** `(ACC_DESCR | ACC_TITLE | TITLE) EOL` */
  private text(k: number): void {
    const j = this.i++;
    const image = this.raw(j);
    const type = KIND_OF[k] ?? 'Title';
    const range = this.range(j);
    while (range.start < range.end && /[\t ]/.test(this.src[range.start] ?? '')) range.start++;
    let text: string;
    if (type === 'Title') text = this.title = titleValue(image);
    else if (type === 'AccTitle') text = this.accTitle = accTitleValue(image);
    else text = this.accDescr = accDescrValue(image);
    const kind = ID_OF[type];
    this.children.push({ id: this.id(kind), type, range, text });
    this.st.statement(kind, range);
    this.eol();
  }
}
