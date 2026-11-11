import {
  Kind,
  LineIndex,
  ParseState,
  Probe,
  inKindSet,
  isLineEnd,
  isSpace,
  nodeId,
  significantTokens,
  skipTo,
} from '@mermaid-js/core/parser-kit';
import type { AstId, Range, TokenView } from '@mermaid-js/core/parser-kit';
import { DEFAULT_LIMITS, LIMIT_CODES } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type {
  ClassInterfaceRefNode,
  ClassRefNode,
  ClassSimpleStmt,
  ClassStatementNode,
  ClassTextNode,
} from './ast.ts';
import { ClassBuilder, splitClassName } from './model.ts';
import { T } from './tokens.ts';
import {
  AFTER_URL,
  ALPHANUM,
  ALPHANUM_KINDS,
  BOUNDARY,
  CALLBACK_ARGS,
  CLICK_ACTION,
  COMMA,
  EXPECTED,
  GENERIC,
  LINK_TARGET,
  MODE_KINDS,
  NAME_NEXT,
  NAME_PART,
  NAME_START,
  NS_BOUNDARY,
  NS_NEXT,
  PROBE_FOLLOWS,
  SQE,
  STOP,
  STR,
  STYLE_EXPECTED,
  STYLE_PART,
  STYLE_PART_KINDS,
  UNCLOSED,
  significantIndex,
} from './tables.ts';
import type { Frame, Name } from './tables.ts';
import { v12Text } from '@mermaid-js/shared/parser/v12-text';
import type { V12Text } from '@mermaid-js/shared/parser/v12-text';
import { lex } from './lexer.ts';
import type { ClassLex } from './lexer.ts';
import { S } from './rules.ts';
import { tokenValue } from './tokens-api.ts';
import type { ClassParseOptions } from './parser.ts';

/**
 * One parse. Each grammar rule is a method; `i` indexes the significant tokens. A rule that
 * fails records a diagnostic and throws {@link STOP}; the statement loop catches it and
 * recovers.
 */
/** A class mention whose AST id is set when the parse ends. */
interface Mention {
  node: { id: string };
  classId: string;
  made: boolean;
}

/** A name that reads the same without backticks: letters, digits, `_` and `-`. */
const PLAIN_NAME = /^[\p{L}\p{N}_-]+$/u;

export abstract class ParserBase {
  /** Class mentions in source order; their ids are set at the end ({@link mentionIds}). */
  protected readonly mentions: Mention[] = [];
  private readonly interfaces = new Map<string, number>();
  protected readonly pre: PreprocessResult;
  protected readonly v12: V12Text;
  protected readonly st = new ParseState();
  protected readonly ids: ParseState['ids'];
  protected readonly db: ClassBuilder;
  protected readonly probe: Probe | undefined;
  protected readonly fullTokens: ClassLex;
  protected lexed: ClassLex;
  protected tokens: TokenView;
  /** Index into {@link lexed} of each significant token. */
  protected at: Int32Array;
  protected i = 0;
  /** Source offset {@link tokens} was lexed from (after a restart, mid-document). */
  protected viewFrom: number;
  protected lines: LineIndex | undefined;
  protected hint: string | undefined;
  protected restartFrom = -1;
  protected lastRestart = -1;
  protected restarts = 0;
  protected readonly children: ClassStatementNode[] = [];
  protected readonly frames: Frame[] = [];
  protected needSeparator = false;
  protected statementCount = 0;
  protected ended = false;
  protected readonly maxEdges: number;
  protected readonly maxNodes: number;
  protected readonly maxDepth: number;

  constructor(
    protected readonly src: string,
    protected readonly options: ClassParseOptions
  ) {
    const pre = (this.pre = options.preprocessed ?? preprocess(src));
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    this.ids = this.st.ids;
    const diagnostics = this.st.diagnostics;
    this.db = new ClassBuilder({
      error: (code, message, range) => {
        diagnostics.error(code, message, range);
      },
    });
    this.maxEdges = options.maxEdges ?? DEFAULT_LIMITS.maxEdges;
    this.maxNodes = options.maxNodes ?? DEFAULT_LIMITS.maxNodes;
    this.maxDepth = options.maxDepth ?? DEFAULT_LIMITS.maxDepth;
    // Class's `LABEL` rule never splits an entity placeholder: each of its characters takes
    // the range of the `#` or `;` it stands for.
    this.v12 = v12Text(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range),
      true
    );
    const probe =
      options.probe === undefined ? undefined : new Probe(src, options.probe, PROBE_FOLLOWS);
    this.probe = probe;
    this.viewFrom = pre.bodyStart;
    this.fullTokens = this.lexed = lex(src, this.v12, undefined, probe);
    this.tokens = significantTokens(this.lexed.tokens);
    this.at = significantIndex(this.lexed);
    if (probe) {
      if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
      else probe.trivia(this.lexed.tokens);
    }
  }

  // ---- tokens -------------------------------------------------------------------------

  protected kind(j = this.i): number {
    return this.tokens.kind[j] ?? Kind.EOF;
  }

  protected start(j: number): number {
    return this.tokens.start[j] ?? this.src.length;
  }

  protected end(j: number): number {
    return this.tokens.end[j] ?? this.src.length;
  }

  /** A token's text as v12's parser read it. */
  protected val(j = this.i): string {
    const k = this.at[j];
    return k === undefined ? '' : tokenValue(this.lexed, k);
  }

  /** Probe hook: the parser tests the current token for `kinds` (a constant list). */
  protected tested(kinds: readonly number[]): void {
    const p = this.probe;
    if (p?.isAt(this.tokens, this.i, this.viewFrom)) p.tested(kinds, this.start(this.i));
  }

  /** Source start of a token, with the text the lexer consumed without a token before it. */
  protected tokStart(j: number): number {
    const { src } = this;
    const s = this.start(j);
    switch (this.kind(j)) {
      case T.Str:
        return src[s - 1] === '"' ? s - 1 : s;
      case T.GenericType:
        return src[s - 1] === '~' ? s - 1 : s;
      case T.BquoteStr:
        return src[s - 1] === '`' ? s - 1 : s;
      case T.CallbackArgs:
        return src[s - 1] === '(' ? s - 1 : s;
      case T.CallbackName: {
        let b = s;
        while (b > 0 && isSpace(src.charCodeAt(b - 1))) b--;
        return src.startsWith('call', b - 4) ? b - 4 : s;
      }
      case T.AccDescrMultilineValue: {
        let b = s;
        while (b > 0 && isSpace(src.charCodeAt(b - 1))) b--;
        if (src[b - 1] !== '{') return s;
        b--;
        while (b > 0 && isSpace(src.charCodeAt(b - 1))) b--;
        return src.startsWith('accDescr', b - 8) ? b - 8 : s;
      }
      default:
        return s;
    }
  }

  protected tokEnd(j: number): number {
    const { src } = this;
    const e = this.end(j);
    switch (this.kind(j)) {
      case T.Str:
        return src[e] === '"' ? e + 1 : e;
      case T.GenericType:
        return src[e] === '~' ? e + 1 : e;
      case T.BquoteStr:
        return src[e] === '`' ? e + 1 : e;
      case T.CallbackArgs:
        return src[e] === ')' ? e + 1 : e;
      case T.AccDescrMultilineValue:
        return src[e] === '}' ? e + 1 : e;
      default:
        return e;
    }
  }

  protected range(a: number, b = a): Range {
    return { start: this.tokStart(a), end: this.tokEnd(b) };
  }

  /** From token `from` to the last one consumed. */
  protected span(from: number): Range {
    const start = this.tokStart(from);
    return { start, end: this.i > from ? this.tokEnd(this.i - 1) : start };
  }

  /** The text of a token with its range (quotes included). */
  protected textNode(j: number): ClassTextNode {
    return { text: this.val(j), range: this.range(j) };
  }

  // ---- errors and recovery ------------------------------------------------------------

  protected lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  /** How an error message names the token at `j`. */
  protected found(j = this.i): string {
    const k = this.kind(j);
    if (k === Kind.EOF || k === T.Eof || k === T.EofInStruct) return 'the end of the text';
    if (k === Kind.Newline) return 'a line break';
    if (k === Kind.Error) return `the character \`${this.val(j)}\``;
    const r = this.range(j);
    const t = this.src.slice(r.start, r.end).trim();
    return t.length > 24 ? `\`${t.slice(0, 24)}…\`` : `\`${t}\``;
  }

  /** Offset of the line break ending the line that holds `at`. */
  protected lineBreakAfter(at: number): number {
    const { src } = this;
    let e = at;
    while (e < src.length && !isLineEnd(src.charCodeAt(e))) e++;
    return e;
  }

  /** Whether a lexer-mode token from token `from` on, before the current one, runs to the end. */
  protected runsToEnd(from: number): boolean {
    for (let j = from; j < this.i; j++) {
      if (inKindSet(MODE_KINDS, this.kind(j)) && this.end(j) >= this.src.length) return true;
    }
    return false;
  }

  protected restartAt(at: number): void {
    if (at > this.lastRestart && at <= this.src.length && this.restarts < 64) {
      this.restartFrom = at;
    }
  }

  /**
   * A token of a lexer mode (a string, a generic type, …) at or just before the error that
   * ran to the end of the text: the cause, reported at its opener.
   */
  protected unclosedMode(): boolean {
    const { i, src } = this;
    // The empty value a mode gives at the end of the text may follow (an unclosed `"abc` lexes as `abc`, then an empty string).
    for (let j = i; j >= 0 && j >= i - 2; j--) {
      if (!inKindSet(MODE_KINDS, this.kind(j))) continue;
      const s = this.start(j);
      const e = this.end(j);
      if (e < src.length || this.tokEnd(j) !== e) continue;
      // An empty value counts only after its opener (`click A call` at the end of the text).
      if (s === e && this.tokStart(j) === s) continue;
      const [what, closer, code] = UNCLOSED[this.kind(j)] ?? ['text', 'closer', 'UNCLOSED'];
      const opener = { start: this.tokStart(j), end: s };
      const written = src.slice(opener.start, opener.end).trim();
      this.st.diagnostics.error(
        code,
        `Unclosed ${what}: the ${written ? `\`${written}\`` : 'text'} at line ${this.lineOf(opener.start)} has no closing ${closer}. Add ${closer} to close it.`,
        opener.end > opener.start ? opener : { start: s, end: Math.min(s + 1, src.length) },
        {
          related: [
            { message: 'The text ends here.', range: { start: src.length, end: src.length } },
          ],
        }
      );
      this.restartAt(this.lineBreakAfter(s));
      return true;
    }
    return false;
  }

  /** Record what was found where one of `want` was expected. */
  protected report(want: readonly number[], hint?: string, table = EXPECTED): void {
    this.tested(want);
    const { st } = this;
    if (this.unclosedMode()) return;
    const k = this.kind();
    const where = this.range(this.i);
    if (k === Kind.Error) {
      const why = hint ?? this.hint;
      st.diagnostics.error(
        'UNEXPECTED_CHARACTER',
        `Unexpected character \`${this.val()}\`${why ? `; ${why}` : ''}.`,
        where,
        { expected: table.names(want) }
      );
      return;
    }
    st.diagnostics.unexpected(
      'UNEXPECTED',
      where,
      table.names(want),
      this.found(),
      undefined,
      hint ?? this.hint
    );
  }

  /** Report what was found where one of `want` was expected, then stop the statement. */
  protected fail(want: readonly number[], hint?: string, table = EXPECTED): never {
    this.report(want, hint, table);
    throw STOP;
  }

  /** Skip to the next statement boundary after an error (R-PARSE-4). */
  protected recover(): void {
    const { probe } = this;
    const frame = this.frames[this.frames.length - 1];
    if (frame) {
      frame.needSeparator = true;
      frame.items++;
    } else {
      this.needSeparator = true;
      this.statementCount++;
    }
    if (this.restartFrom < 0) {
      probe?.freeze();
      this.i = skipTo(this.tokens, this.i, frame ? NS_BOUNDARY : BOUNDARY);
      return;
    }
    const from = this.restartFrom;
    this.restartFrom = -1;
    this.lastRestart = from;
    this.restarts++;
    const lexedAgain = probe !== undefined && from < probe.offset ? probe : undefined;
    if (lexedAgain) lexedAgain.reset();
    else probe?.freeze(true);
    const stack: number[] = [];
    for (const _ of this.frames) stack.push(S.namespace, S.namespaceBody);
    this.lexed = lex(this.src, this.v12, undefined, lexedAgain, from, stack);
    this.tokens = significantTokens(this.lexed.tokens);
    this.at = significantIndex(this.lexed);
    this.viewFrom = from;
    this.i = 0;
  }

  // ---- token rules --------------------------------------------------------------------

  protected expect(k: number, want: readonly number[] = [k]): number {
    this.tested(want);
    if (this.kind() !== k) this.fail(want);
    return this.i++;
  }

  /** jison `className`: names joined by `.` or written together, an optional `~T~` last. */
  protected className(): Name {
    const from = this.i;
    let raw = '';
    for (;;) {
      this.tested(NAME_START);
      const k = this.kind();
      if (inKindSet(ALPHANUM, k)) {
        raw += this.val(this.i++);
        this.tested(NAME_NEXT);
        const n = this.kind();
        if (n === T.Dot) {
          raw += '.';
          this.i++;
          continue;
        }
        if (n === T.GenericType) {
          raw += `~${this.val(this.i++)}~`;
          break;
        }
        if (inKindSet(NAME_PART, n)) continue;
        break;
      }
      if (k === T.BquoteStr) {
        raw += this.backtickName();
        this.tested(GENERIC);
        if (this.kind() === T.GenericType) raw += `~${this.val(this.i++)}~`;
        break;
      }
      this.fail(NAME_START);
    }
    return { raw, id: splitClassName(raw).id, range: this.span(from) };
  }

  /** jison `namespaceName`: like {@link className}, without a generic type. */
  protected namespaceName(): [string, Range] {
    const from = this.i;
    let raw = '';
    for (;;) {
      this.tested(NAME_START);
      const k = this.kind();
      if (inKindSet(ALPHANUM, k)) {
        raw += this.val(this.i++);
        this.tested(NS_NEXT);
        const n = this.kind();
        if (n === T.Dot) {
          raw += '.';
          this.i++;
          continue;
        }
        if (inKindSet(NAME_PART, n)) continue;
        break;
      }
      if (k === T.BquoteStr) {
        raw += this.backtickName();
        break;
      }
      this.fail(NAME_START);
    }
    return [raw, this.span(from)];
  }

  /**
   * A backtick-quoted name. Without its closing backtick it runs to the end of the text, which v12
   * accepted, with the line break it appended: kept so, with a warning.
   */
  protected backtickName(): string {
    const j = this.i++;
    const k = this.at[j] ?? 0;
    const { textStart, textEnd, v12 } = this.lexed;
    const e = textEnd[k] ?? 0;
    if (e <= v12.length || this.src[this.end(j)] === '`') return this.val(j);
    const r = this.range(j);
    this.st.diagnostics.warning(
      'UNCLOSED_NAME',
      `Unclosed name: the backtick at line ${this.lineOf(r.start)} has no closing backtick, so the name runs to the end of the text. Add a backtick to close it.`,
      { start: r.start, end: Math.min(r.start + 1, this.src.length) }
    );
    return this.val(j) + v12.text.slice(Math.max(v12.length, textStart[k] ?? 0), e);
  }

  /** jison `alphaNumToken`: one token. */
  protected alphaNumToken(): string {
    this.tested(ALPHANUM_KINDS);
    if (!inKindSet(ALPHANUM, this.kind())) this.fail(ALPHANUM_KINDS);
    return this.val(this.i++);
  }

  /** A `"…"` value (one Str token). */
  protected str(): ClassTextNode {
    const j = this.expect(T.Str, STR);
    return this.textNode(j);
  }

  /** jison `classLabel`: `["text"]`. */
  protected classLabel(): ClassTextNode {
    const from = this.i++;
    const text = this.str().text;
    this.expect(T.SQE, SQE);
    return { text, range: this.span(from) };
  }

  /**
   * The range of a name's symbol: the id alone, inside its backticks and without the generic
   * type written after it (`A` of `A~T~`, also when `A` is backtick-quoted), so that rename edits the name
   * only (D92). A name whose text does not start with its id keeps the whole range (the
   * service then leaves it out).
   */
  protected idRange(id: string, range: Range): Range {
    const { src } = this;
    let start = range.start;
    // Inside backticks only a plain name: one that needs them (`IPC::Sender`) stays whole.
    if (src[start] === '`' && src[start + 1 + id.length] === '`' && PLAIN_NAME.test(id)) start++;
    if (id === '' || src.slice(start, start + id.length) !== id) return range;
    return { start, end: start + id.length };
  }

  protected symbolRange(name: Name): Range {
    return this.idRange(name.id, name.range);
  }

  /** A mention of a class name: its AST node (id set by {@link mentionIds}) and symbol. */
  protected ref(name: Name, created: boolean): ClassRefNode {
    this.st.symbol(name.id, 'class', this.symbolRange(name), created ? 'def' : 'ref');
    return this.mention(
      { id: '', type: 'ClassRef', range: name.range, name: name.raw, classId: name.id },
      name.id,
      created
    );
  }

  /** Record a mention of class `classId`; `made`: the mention made the class. */
  protected mention<N extends { id: string }>(node: N, classId: string, made: boolean): N {
    this.mentions.push({ node, classId, made });
    return node;
  }

  /**
   * The mention ids, once every mention is known: the one that made class `A` is `n:A`, the
   * others `n:A@2`, `n:A@3`, … in source order (`n:A` first when none made it).
   */
  protected mentionIds(): void {
    const byName = new Map<string, Mention[]>();
    for (const m of this.mentions) {
      let list = byName.get(m.classId);
      if (!list) byName.set(m.classId, (list = []));
      list.push(m);
    }
    for (const [name, list] of byName) {
      const base = nodeId(name);
      const maker = list.find((m) => m.made) ?? list[0];
      let k = 1;
      for (const m of list) m.node.id = m === maker ? base : `${base}@${++k}`;
    }
  }

  /** `i:<name>`, then `@2`, … : the AST id of a lollipop interface end. */
  protected interfaceId(name: string): AstId {
    const n = (this.interfaces.get(name) ?? 0) + 1;
    this.interfaces.set(name, n);
    const id = `i:${nodeId(name).slice(2)}`;
    return n === 1 ? id : `${id}@${n}`;
  }

  /** `addClass` for a mention: whether it made the class. */
  protected addClass(name: Name): boolean {
    const made = this.db.addClass(name.raw, nodeId(name.id));
    if (made) this.checkNodes(name.range);
    return made;
  }

  protected checkNodes(r: Range): void {
    if (this.db.classCount === this.maxNodes + 1) {
      this.st.diagnostics.error(
        LIMIT_CODES.maxNodes,
        `The diagram has more than ${this.maxNodes} classes, the limit. The limit is set by the page or app that renders the diagram.`,
        r
      );
    }
  }

  /** The interface end of a lollipop relationship: its AST node and symbol. */
  protected interfaceRef(name: Name, ast: AstId, index: number): ClassInterfaceRefNode {
    this.st.symbol(name.id, 'interface', this.symbolRange(name), 'def');
    return {
      id: ast,
      type: 'InterfaceRef',
      range: name.range,
      name: name.raw,
      interfaceId: `interface${index}`,
    };
  }

  /** Comma-separated names in a string (`cssClass "A,B"`): symbols with their ranges. */
  protected listRefs(list: string, r: Range, kindName: string, out: string[]): void {
    const exact = this.src.slice(r.start + 1, r.end - 1) === list;
    let at = r.start + 1;
    for (const part of list.split(',')) {
      const pr = exact ? { start: at, end: at + part.length } : r;
      // v12 looked each part up as written: `"A, B"` names `A` and ` B`, which no class is.
      if (part !== '' && part.trim() === part) {
        const { id } = splitClassName(part);
        this.st.symbol(id, kindName, exact ? this.idRange(id, pr) : pr, 'ref');
      }
      out.push(part);
      at += part.length + 1;
    }
  }

  /** jison `stylesOpt`: styles separated by `,` (each the text of its parts, joined). */
  protected stylesOpt(): string[] {
    const out: string[] = [];
    for (;;) {
      this.tested(STYLE_PART_KINDS);
      if (!inKindSet(STYLE_PART, this.kind()))
        this.fail(STYLE_PART_KINDS, undefined, STYLE_EXPECTED);
      let s = this.val(this.i++);
      for (;;) {
        this.tested(STYLE_PART_KINDS);
        if (!inKindSet(STYLE_PART, this.kind())) break;
        s += this.val(this.i++);
      }
      out.push(s);
      this.tested(COMMA);
      if (this.kind() !== T.Comma) return out;
      this.i++;
    }
  }

  /** `callback`, `link` and `click` statements, read into their AST node. */
  protected clickStatement(node: ClassSimpleStmt): void {
    const { db } = this;
    const from = this.i;
    const k = this.kind();
    this.i++;
    const name = this.className();
    this.st.symbol(name.id, 'class', this.symbolRange(name), 'ref');
    node.refs.push(name.raw);
    if (k === T.Callback) {
      const fn = this.str().text;
      node.callback = { targets: [name.id], name: fn };
      this.tested(STR);
      if (this.kind() === T.Str) node.tooltip = this.val(this.i++);
      db.setClickEvent(name.raw, fn, this.span(from));
    } else if (k === T.Link) {
      node.url = this.str().text;
      this.link(name, node);
      return;
    } else {
      this.tested(CLICK_ACTION);
      const a = this.kind();
      if (a === T.Href) {
        this.i++;
        node.url = this.str().text;
        this.link(name, node);
        return;
      }
      if (a !== T.CallbackName) this.fail(CLICK_ACTION);
      const fn = this.val(this.i++);
      this.tested(CALLBACK_ARGS);
      const args = this.kind() === T.CallbackArgs ? this.val(this.i++) : undefined;
      node.callback =
        args === undefined
          ? { targets: [name.id], name: fn }
          : { targets: [name.id], name: fn, args };
      this.tested(STR);
      if (this.kind() === T.Str) node.tooltip = this.val(this.i++);
      db.setClickEvent(name.raw, fn, this.span(from), args);
    }
    if (node.tooltip !== undefined) db.setTooltip(name.raw, node.tooltip);
  }

  /** After a link's URL: `[ "tooltip" ] [ target ]`. */
  protected link(name: Name, node: ClassSimpleStmt): void {
    this.tested(AFTER_URL);
    if (this.kind() === T.Str) node.tooltip = this.val(this.i++);
    this.tested(LINK_TARGET);
    if (this.kind() === T.LinkTarget) node.target = this.val(this.i++);
    this.db.setLink(name.raw, node.url ?? '', node.target);
    if (node.tooltip !== undefined) this.db.setTooltip(name.raw, node.tooltip);
  }
}
