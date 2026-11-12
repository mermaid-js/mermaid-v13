/**
 * The state parser's cursor over the parser tokens (DESIGN §4.2): reading tokens, reporting
 * what was found where something else was expected (R-ERR-2), recording symbols, and
 * recovering at the next statement boundary (R-PARSE-4). The grammar rules are in
 * `parser.ts`.
 */
import { Kind, LineIndex, ParseState } from '@mermaid-js/core/parser-kit';
import { STOP } from '@mermaid-js/shared/parser/support';
import type { Probe, Range } from '@mermaid-js/core/parser-kit';
import type { lex } from './lexer.ts';
import { BOUNDARY, BOUNDARY_IN_COMPOSITE, EXPECTED } from './tables.ts';
import { blankAt, multiWordMessage } from './names.ts';
import type { Tokens } from './terminals.ts';
import { T } from './tokens.ts';

/** Thrown after a diagnostic is recorded; caught at statement level. One instance. */
export { STOP };

/**
 * Token access, errors and recovery for one parse; `i` indexes the parser tokens. A rule that
 * fails records a diagnostic and throws {@link STOP}; the statement loop catches it and
 * recovers.
 */
export abstract class StateCursor {
  protected readonly st = new ParseState();
  protected readonly tokens: Tokens;
  protected readonly all: ReturnType<typeof lex>['tokens'];
  protected readonly seen = new Set<string>();
  /**
   * Symbols of the statements being parsed: recorded when a statement completes, dropped when
   * it fails, so a failed `A -->` does not define `A`.
   */
  protected readonly pending: [name: string, kind: string, range: Range, role?: 'def' | 'ref'][] =
    [];
  protected lines: LineIndex | undefined;
  protected hint: string | undefined;
  /** The hint of the statement before the current one, and where the current one starts. */
  protected prevHint: string | undefined;
  protected stmtFrom = 0;
  protected i = 0;

  constructor(
    protected readonly src: string,
    lexed: { tokens: Tokens; all: ReturnType<typeof lex>['tokens'] },
    protected readonly probe: Probe | undefined
  ) {
    this.tokens = lexed.tokens;
    this.all = lexed.all;
  }

  // ---- tokens -------------------------------------------------------------------------

  protected kind(j = this.i): number {
    return this.tokens.kind[j] ?? Kind.EOF;
  }

  protected text(j = this.i): string {
    return this.tokens.text[j] ?? '';
  }

  /** Source range of token `j` (with the text jison consumed around it). */
  protected range(j = this.i): Range {
    const t = this.tokens;
    if (j >= t.length) return { start: this.src.length, end: this.src.length };
    return { start: t.from[j] ?? 0, end: t.to[j] ?? 0 };
  }

  /** From token `from` to the last one consumed, blanks trimmed off the end. */
  protected span(from: number): Range {
    const start = this.range(from).start;
    if (this.i <= from) return { start, end: start };
    let end = this.range(this.i - 1).end;
    while (end > start && /\s/.test(this.src[end - 1] ?? '')) end--;
    return { start, end };
  }

  /** A token's own range, blanks trimmed. */
  protected own(j: number): Range {
    let s = this.tokens.start[j] ?? 0;
    let e = this.tokens.end[j] ?? 0;
    while (s < e && /\s/.test(this.src[s] ?? '')) s++;
    while (e > s && /\s/.test(this.src[e - 1] ?? '')) e--;
    return { start: s, end: e };
  }

  /** Probe hook: the parser tests the current token for `kinds` (a constant list). */
  protected tested(kinds: readonly number[]): void {
    const p = this.probe;
    if (p?.isAt(this.tokens, this.i)) p.tested(kinds, this.tokens.start[this.i] ?? 0);
  }

  protected at(kinds: readonly number[], k: number): boolean {
    this.tested(kinds);
    return this.kind() === k;
  }

  protected expect(want: readonly number[]): number {
    this.tested(want);
    if (!want.includes(this.kind())) this.fail(want);
    return this.i++;
  }

  // ---- errors and recovery ------------------------------------------------------------

  protected lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  /** How an error message names the token at `j`. */
  protected found(j = this.i): string {
    const k = this.kind(j);
    if (k === Kind.EOF || (k === T.EndOfInput && this.text(j) === '')) return 'the end of the text';
    if (k === Kind.Newline || k === T.EndOfInput) return 'a line break';
    const r = this.own(j);
    const t = this.src.slice(r.start, r.end).trim();
    if (t === '') return 'nothing';
    return t.length > 24 ? `\`${t.slice(0, 24)}…\`` : `\`${t}\``;
  }

  /** Report what was found where one of `want` was expected, then stop the statement. */
  protected fail(want: readonly number[], hint?: string): never {
    this.tested(want);
    const { st } = this;
    const k = this.kind();
    const where = this.where();
    if (k === T.MultiWordState) {
      this.multiWord(where);
      throw STOP;
    }
    if (k === T.DefaultClassDefId) {
      st.diagnostics.error(
        'CLASSDEF_DEFAULT',
        '`classDef default` is not supported in state diagrams: give the class another name and apply it with `class`.',
        where
      );
      throw STOP;
    }
    // A lexical error at the start of a statement comes from the text before it (`scale 3`
    // with no `width`): explain that statement.
    const zeroWidth = k === Kind.Error && where.end === where.start;
    const why = this.why(
      hint ?? (zeroWidth && this.i === this.stmtFrom ? this.prevHint : undefined)
    );
    if ((k === Kind.Error || k === T.Invalid) && !this.crossesLine()) {
      const ch = this.src.slice(where.start, Math.max(where.end, where.start + 1)).trim();
      const what = ch ? `character \`${ch}\`` : blankAt(this.src, where.start);
      const arrow = ch === '-' && !why ? '; a transition is written `A --> B`' : '';
      st.diagnostics.error('UNEXPECTED_CHARACTER', `Unexpected ${what}${why || arrow}.`, where, {
        expected: EXPECTED.names(want),
      });
      throw STOP;
    }
    const found = this.crossesLine() ? 'the end of the line' : this.found();
    const d = st.diagnostics.unexpected('UNEXPECTED', where, EXPECTED.names(want), found);
    if (why) d.message = `${d.message.slice(0, -1)}${why}.`;
    throw STOP;
  }

  /** Whether the current token is on a later line than the statement's previous token. */
  protected crossesLine(): boolean {
    const { i, tokens } = this;
    if (i <= this.stmtFrom || i >= tokens.length) return false;
    const k = this.kind();
    if (k === Kind.Newline || k === T.EndOfInput) return false;
    return /[\n\r]/.test(this.src.slice(tokens.end[i - 1] ?? 0, tokens.start[i] ?? 0));
  }

  /**
   * Where an error is reported: the current token, or, at a line break or on a later line, the
   * end of the statement's line.
   */
  protected where(): Range {
    const { i, tokens } = this;
    if (i >= tokens.length) return { start: this.src.length, end: this.src.length };
    const k = this.kind();
    if (k === Kind.Newline || k === T.EndOfInput) {
      const s = tokens.start[i] ?? 0;
      return { start: s, end: s };
    }
    if (this.crossesLine()) {
      const e = this.own(i - 1).end;
      return { start: e, end: e };
    }
    return this.own(i);
  }

  /** Queue a symbol; a state's role is decided when it is recorded (its first is the def). */
  protected symbol(name: string, kind: string, range: Range, role?: 'def' | 'ref'): void {
    this.pending.push([name, kind, range, role]);
  }

  /** Record the queued symbols of the statements that completed. */
  protected flushSymbols(): void {
    for (const [name, kind, range, role] of this.pending) {
      const r = role ?? (this.seen.has(name) ? 'ref' : 'def');
      if (role === undefined) this.seen.add(name);
      this.st.symbol(name, kind, range, r);
    }
    this.pending.length = 0;
  }

  /** `state a b {`: one error for the name, which is returned (v12's lexer threw here). */
  protected multiWord(where: Range): string {
    const name = this.text()
      .replace(/\s*\{$/, '')
      .trim();
    this.st.diagnostics.error('MULTI_WORD_STATE', multiWordMessage(name), where);
    return name;
  }

  protected why(hint: string | undefined): string {
    const h = hint ?? this.hint;
    return h ? `; ${h}` : '';
  }

  /**
   * Skip to the next statement boundary after an error in the statement that starts at token
   * `from` (R-PARSE-4): a line break, or the `}` of the composite state it is in. Some line
   * breaks are no tokens (all of them inside a composite, as in jison), so the first token on
   * a later line is a boundary too.
   */
  protected recover(inComposite: boolean, from: number): void {
    this.prevHint = this.hint;
    this.hint = undefined;
    this.probe?.freeze();
    const { tokens, src } = this;
    const boundary = inComposite ? BOUNDARY_IN_COMPOSITE : BOUNDARY;
    let j = this.i;
    while (j < tokens.length && boundary[tokens.kind[j] ?? Kind.EOF] !== 1) {
      if (j > from && /[\n\r]/.test(src.slice(tokens.end[j - 1] ?? 0, tokens.start[j] ?? 0))) break;
      j++;
    }
    this.i = j;
  }
}
