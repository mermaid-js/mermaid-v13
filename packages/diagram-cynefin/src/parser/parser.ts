// cspell:words accdescr
/**
 * Cynefin parser: recursive descent over the significant {@link lex} tokens (gated against
 * v12's Langium lexer, #461), producing a {@link CynefinModel}, the typed AST, symbols,
 * statement spans and diagnostics (DESIGN §4.2, spec #423).
 *
 * The grammar is v12's `cynefin.langium` (with `common.langium`), ported rule for rule;
 * `grammar/cynefin.ebnf` is the normative form:
 *
 *     Cynefin: NEWLINE* ("cynefin-beta" | "cynefin-beta:") NEWLINE*
 *              (TitleAndAccessibilities | DomainBlock | Transition | NEWLINE)*
 *     DomainBlock: DOMAIN_NAME NEWLINE* (STRING NEWLINE*)*
 *     Transition: DOMAIN_NAME "--\>" DOMAIN_NAME (":" STRING)? EOL
 *     TitleAndAccessibilities: ((ACC_DESCR | ACC_TITLE | TITLE) EOL)+
 *     EOL: NEWLINE+ | EOF
 *
 * so it accepts and rejects what v12's parser does. A domain name followed by `-->` starts a
 * transition, any other a block (Langium's lookahead). Unlike v12 it does not stop at the first
 * error: it reports it, skips to the next line break and carries on (R-PARSE-4); items right
 * after the failed line still join the block before it, so one error gives one diagnostic.
 * Every lexer error is reported, also one in the rest of a line it skips, as v12's lexer
 * reported each; a parse error is reported once per line.
 *
 * With `probe` (R-LANG-7, D95, #470) the rules also record what they would accept at that offset,
 * at the same decision points as their `fail` lists, for completion; nothing else changes.
 *
 * Two warnings, one per parse each (D226): `CYNEFIN_DUPLICATE_DOMAIN` names the blocks a later
 * block of the same domain replaced (D364), `CYNEFIN_SELF_LOOP` the `x --> x` transitions the
 * model leaves out (D365).
 */
import { checkLimit } from '@mermaid-js/core/limits';
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
  ID_CONTROL,
  ID_RESERVED,
  idEscaper,
  STOP,
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
import { CYNEFIN_DOMAIN_NAMES } from '../model.ts';
import type {
  CynefinDomain,
  CynefinDomainName,
  CynefinModel,
  CynefinTransition,
} from '../model.ts';
import type {
  CynefinDocument,
  CynefinDomainNode,
  CynefinStatementNode,
  CynefinTextNode,
  CynefinTransitionNode,
} from './ast.ts';
import { accDescrValue, accTitleValue, labelValue, titleValue } from './convert.ts';
import { lex } from './lexer.ts';
import { CYNEFIN_TRIVIA, T } from './tokens.ts';

export interface CynefinParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
  /** The integrator's cap on items (core `DEFAULT_LIMITS.maxNodes` when absent, R-SEC-5). */
  maxNodes?: number;
  /** The integrator's cap on transitions (core `DEFAULT_LIMITS.maxEdges` when absent). */
  maxEdges?: number;
}

export type CynefinParseResult = ParseResult<CynefinModel, CynefinDocument>;

const TEXT = [T.Title, T.AccTitle, T.AccDescr];
const HEADER = [T.Header, T.HeaderColon];
const DOC = [T.DomainName, ...TEXT, Kind.Newline, Kind.EOF];
const LINE_END = [Kind.Newline, Kind.EOF];
/** Before the header: line breaks, then `cynefin-beta`. */
const HEAD = [...HEADER, Kind.Newline];
/** Inside a block (after its name or an item, or at a later line start): an item too. */
const IN_BLOCK = [T.String, ...DOC];
/** After a transition's target: its label, or the line end. */
const AFTER_TARGET = [T.Colon, ...LINE_END];

/** Where recovery resumes (R-PARSE-4). */
const BOUNDARY = kindSet(Kind.Newline, Kind.EOF);
/**
 * Kinds a probe's cursor follows rather than extends: `:`, `-->`, and an item or label, which
 * its closing quote ends (right after `"Probe"` another item may follow).
 */
const PROBE_FOLLOWS = kindSet(T.Colon, T.Arrow, T.String);

/** The keyword of each statement-value token, also its probe mode ({@link probeMode}). */
const VALUE_WORDS: Readonly<Record<number, string>> = {
  [T.Title]: 'title',
  [T.AccTitle]: 'accTitle',
  [T.AccDescr]: 'accDescr',
};

/**
 * The probe's mode at `o` (R-LANG-7). The lexer has no modes (Langium's has none), so the
 * mode names what the offset is in: `title`, `accTitle` or `accDescr` past the keyword of
 * that statement, `string` inside an item or label (closed or not), else `INITIAL` (code).
 * Pie's rule, over the same `common.langium` tokens.
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
    // An unclosed item is an error token from its quote to the line end.
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

/** `a`, `a and b`, `a, b and c` (or `or`). */
export function listOf(parts: readonly string[], conjunction = 'and'): string {
  if (parts.length < 2) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} ${conjunction} ${parts[parts.length - 1] ?? ''}`;
}

/** The domain names quoted and joined with `or`, for messages. */
const DOMAIN_LIST = listOf(
  CYNEFIN_DOMAIN_NAMES.map((n) => `\`${n}\``),
  'or'
);

/** Human names for what the parser expects (R-ERR-2, R-ERR-5). */
const EXPECTED = new ExpectedTable([
  ['`cynefin-beta`', HEADER],
  [`a domain (${DOMAIN_LIST})`, [T.DomainName]],
  ['an item such as `"Probe"`', [T.String]],
  ['`title`, `accTitle:` or `accDescr`', TEXT],
  ['`-->`', [T.Arrow]],
  ['`:` and a label', [T.Colon]],
  ['a line break', [Kind.Newline]],
  ['the end of the text', [Kind.EOF]],
]);

const KIND_OF: Record<number, CynefinTextNode['type']> = {
  [T.Title]: 'Title',
  [T.AccTitle]: 'AccTitle',
  [T.AccDescr]: 'AccDescr',
};
const ID_OF: Record<CynefinTextNode['type'], string> = {
  Title: 'title',
  AccTitle: 'accTitle',
  AccDescr: 'accDescr',
};
const ONE_PER_LINE = 'put each transition, title and accessibility statement on a line of its own';
const QUOTE_LABEL = 'a transition label is quoted, as in `complex --> clear : "Pattern found"`';

/** Items after a failed line that no block owns (see `CynefinParser.open`). */
const STRAY = 'stray';

/**
 * `%`, `>`, `@` and `#` percent-encoded, as in every AST id (DESIGN §4.2), and so are the
 * characters XML 1.0 cannot hold (C0 controls but tab, LF and CR; DEL; lone surrogates; U+FFFE,
 * U+FFFF), which a label can carry through `\0`, `\b`, `\f`, `\v` or the source. Two hex digits
 * up to U+007F, four above, so the encoding stays one-to-one.
 */
const esc = /* @__PURE__ */ idEscaper(`${ID_RESERVED}${ID_CONTROL}`);

/** Parse a cynefin diagram. Never throws: problems are error diagnostics. */
export function parseCynefin(src: string, options: CynefinParseOptions = {}): CynefinParseResult {
  return new CynefinParser(src, options).parse();
}

/**
 * One parse. Each grammar rule is a method that returns what it read; a rule that fails
 * records a diagnostic and throws {@link STOP}, and the statement loop recovers.
 */
class CynefinParser {
  private readonly pre: PreprocessResult;
  private readonly view: SourceView;
  private readonly full: TokenStream;
  private readonly t: TokenView;
  private i = 0;
  private readonly state = new ParseState();
  private readonly probe: Probe | undefined;
  private readonly children: CynefinStatementNode[] = [];
  private lines: LineIndex | undefined;
  /** Mentions per id base (`d:complex`, `i:complex/a`, `title`, …), for the `@n` suffixes. */
  private readonly mentions = new Map<string, number>();
  /** Every block of each domain, by name, in the order of each name's first block. */
  private readonly blocks = new Map<CynefinDomainName, CynefinDomainNode[]>();
  private readonly transitions: CynefinTransition[] = [];
  private readonly selfLoops: CynefinTransitionNode[] = [];
  /** The items and transitions read so far, in every block (the caps count them). */
  private itemCount = 0;
  private transitionCount = 0;
  /**
   * What items after the last statement belong to: the block it left open, or `STRAY` after a
   * line that failed outside a block. A failed line keeps it, so the items after it still join
   * the block before, or are skipped: one error, one diagnostic (pitfall 8).
   */
  private open: CynefinDomainNode | typeof STRAY | undefined;
  /** The last in-text value of each (v12's Langium assignments: the last one wins). */
  private title = '';
  private accTitle = '';
  private accDescr = '';

  constructor(
    private readonly src: string,
    private readonly options: CynefinParseOptions
  ) {
    const pre = (this.pre = options.preprocessed ?? preprocess(src));
    if (!options.preprocessed) this.state.diagnostics.list.push(...pre.diagnostics);
    this.view = sourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    this.full = lex(src, pre.bodyStart, this.view);
    this.t = significantTokens(this.full, CYNEFIN_TRIVIA);
    if (options.probe !== undefined) {
      const probe = (this.probe = new Probe(src, options.probe, PROBE_FOLLOWS));
      if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
      else probe.trivia(this.full);
      // Ignored when the offset is outside code.
      probe.lexed(probe.offset, probe.offset, probeMode(src, this.full, probe.offset));
    }
  }

  parse(): CynefinParseResult {
    const { state, src } = this;
    this.statement(() => this.header());
    this.document();
    this.warnDuplicates();
    this.warnSelfLoops();
    // In source order (the facet contract, R-LANG-3): the warnings are made after the parse.
    state.diagnostics.list.sort((a, b) => a.range.start - b.range.start);
    const warnings = state.diagnostics.list.filter((d) => d.severity === 'warning');
    const domains: CynefinDomain[] = [];
    for (const [name, nodes] of this.blocks) {
      const last = nodes[nodes.length - 1];
      if (!last) continue;
      const items = last.children.map((n) => Object.freeze({ label: n.label, ast: n.id }));
      domains.push(Object.freeze({ name, ast: last.id, items: Object.freeze(items) }));
    }
    // D218: the in-text title if non-empty, else the front-matter one.
    const title = this.title || this.pre.frontMatter?.title;
    const model: CynefinModel = Object.freeze({
      domains: Object.freeze(domains),
      transitions: Object.freeze(this.transitions),
      ...(title ? { title } : {}),
      accTitle: this.accTitle,
      accDescr: this.accDescr,
      warnings: Object.freeze(warnings),
    });
    const ast: CynefinDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: this.pre.bodyStart, end: src.length },
      children: this.children,
    };
    return state.result(model, ast, this.full, this.options, this.probe);
  }

  // ---- tokens -------------------------------------------------------------------------

  private kind(j = this.i): number {
    return this.t.kind[j] ?? Kind.EOF;
  }

  private range(j = this.i): Range {
    return { start: this.t.start[j] ?? 0, end: this.t.end[j] ?? 0 };
  }

  /** A token's text as v12's lexer read it (removed spans dropped, entities decoded). */
  private raw(j = this.i): string {
    const { start, end } = this.range(j);
    return cook(this.src, start, end, this.view);
  }

  /**
   * Probe hook: the parser tests token `j` for `kinds` (a constant list), or would accept them
   * there. Records them when it is the probed token.
   */
  private tested(kinds: readonly number[], j = this.i): void {
    const p = this.probe;
    if (p?.isAt(this.t, j, this.pre.bodyStart)) p.tested(kinds, this.t.start[j] ?? 0);
  }

  /** Consume a token of `kind` and return its index, or fail. */
  private expect(kind: number, hint?: string): number {
    this.tested([kind]);
    if (this.kind() !== kind) this.fail([kind], hint);
    return this.i++;
  }

  /** The domain name token `j` holds; the lexer matches only the five. */
  private domain(j: number): CynefinDomainName {
    const text = this.raw(j);
    const name = CYNEFIN_DOMAIN_NAMES.find((n) => n === text);
    if (name === undefined) throw new Error(`cynefin parser: \`${text}\` is not a domain name`);
    return name;
  }

  /** `t:<from>><to>`, then `#2`, `#3`, … for a parallel repeat (as edges, DESIGN §4.2). */
  private edgeId(from: CynefinDomainName, to: CynefinDomainName): AstId {
    const base = `t:${from}>${to}`;
    const n = (this.mentions.get(base) ?? 0) + 1;
    this.mentions.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
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
  private fail(want: readonly number[], hint?: string): never {
    const { state } = this;
    const where = this.range();
    if (this.kind() === Kind.Error) {
      this.badCharacters(this.i, hint);
      throw STOP;
    }
    const d = state.diagnostics.unexpected('UNEXPECTED', where, EXPECTED.names(want), this.found());
    const why = hint ?? this.explain();
    if (why) d.message = `${d.message.slice(0, -1)}; ${why}.`;
    throw STOP;
  }

  /**
   * Report the error token `j`, text no token rule matched: an unclosed string or `accDescr {`,
   * or stray characters.
   */
  private badCharacters(j: number, hint?: string): void {
    const { state } = this;
    const where = this.range(j);
    const text = this.raw(j);
    const line = this.lineOf(where.start);
    if (text.startsWith('"') || text.startsWith("'")) {
      const q = text[0] ?? '"';
      state.diagnostics.error(
        'UNCLOSED_STRING',
        `Unclosed label: the \`${q}\` at line ${line} has no closing \`${q}\`. Add \`${q}\` after the label.`,
        where,
        { expected: [`\`${q}\``] }
      );
      return;
    }
    const word = /^[\t ]*(accDescr|accTitle)/.exec(text)?.[1];
    if (word === 'accDescr') {
      state.diagnostics.error(
        'UNCLOSED_ACC_DESCR',
        `Unclosed accessible description: the \`accDescr {\` at line ${line} has no closing \`}\`, and \`accDescr\` without \`{\` takes a \`:\`. Write \`accDescr: …\` or \`accDescr { … }\`.`,
        where
      );
      return;
    }
    if (word === 'accTitle') {
      state.diagnostics.error(
        'UNEXPECTED_CHARACTER',
        'Expected `:` after `accTitle`; write it as `accTitle: …`.',
        where,
        { expected: ['`:`'] }
      );
      return;
    }
    const shown = text.length > 24 ? `${text.slice(0, 24)}…` : text;
    const why = hint ?? this.explainCharacters(text, j);
    state.diagnostics.error(
      'UNEXPECTED_CHARACTER',
      `Unexpected character \`${shown}\`${why ? `; ${why}` : ''}.`,
      where
    );
  }

  /** Why stray characters are not cynefin, where a likely cause shows. */
  private explainCharacters(text: string, j: number): string | undefined {
    const lower = text.toLowerCase();
    const prev = j - 1;
    if (text === ';') return `\`;\` does not end a statement in a cynefin diagram: ${ONE_PER_LINE}`;
    if (/^\s/.test(text)) return 'only spaces, tabs and line breaks separate words';
    const glued = this.kind(prev) === T.DomainName && this.t.end[prev] === this.t.start[j];
    if (glued && /^\w/.test(text)) {
      return `a domain is one of ${DOMAIN_LIST}, with a blank or a line break after it`;
    }
    if (CYNEFIN_DOMAIN_NAMES.some((n) => lower.startsWith(n) && !text.startsWith(n))) {
      return `domain names are written in lower case: ${DOMAIN_LIST}`;
    }
    if (CYNEFIN_DOMAIN_NAMES.some((n) => n.startsWith(text))) {
      return `a domain is one of ${DOMAIN_LIST}`;
    }
    if (text.startsWith('-')) return 'a transition is written `complex --> clear`, with `-->`';
    return undefined;
  }

  private explain(): string | undefined {
    const k = this.kind();
    if (HEADER.includes(k)) return 'a diagram has one `cynefin-beta`, at its start';
    if (k === T.Arrow) return 'a transition starts with its domain, as in `complex --> clear`';
    if (k === T.Colon)
      return 'only a transition takes `:` and a label, as in `complex --> clear : "Pattern found"`';
    if (k === T.String) return 'an item goes after its domain, as in `complex "Probe"`';
    return undefined;
  }

  /**
   * Skip to the next line break after an error (R-PARSE-4), reporting each lexer error in the
   * skipped text: the token that failed is reported already.
   */
  private recover(): void {
    this.probe?.freeze();
    const end = skipTo(this.t, this.i, BOUNDARY);
    for (let j = this.i + 1; j < end; j++) if (this.kind(j) === Kind.Error) this.badCharacters(j);
    this.i = end;
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

  /** `NEWLINE* ("cynefin-beta" | "cynefin-beta:")` */
  private header(): void {
    for (;;) {
      this.tested(HEAD);
      if (this.kind() !== Kind.Newline) break;
      this.i++;
    }
    const k = this.kind();
    if (!HEADER.includes(k)) this.fail(HEADER);
    const range = this.range(this.i++);
    this.state.statement('header', range);
    this.children.push({ id: 'header', type: 'Header', range, colon: k === T.HeaderColon });
  }

  /** `(TitleAndAccessibilities | DomainBlock | Transition | NEWLINE)* EOF` */
  private document(): void {
    for (;;) {
      this.tested(this.open === undefined || this.open === STRAY ? DOC : IN_BLOCK);
      const k = this.kind();
      if (k === Kind.EOF) return;
      if (k === Kind.Newline) {
        this.i++;
        continue;
      }
      const open = this.open;
      this.open = undefined;
      // After a domain name: `-->` makes it a transition (the block's items are tested below).
      if (k === T.DomainName) this.tested([T.Arrow], this.i + 1);
      this.statement(() => {
        if (k === T.DomainName && this.kind(this.i + 1) === T.Arrow) this.transition();
        else if (k === T.DomainName) this.block();
        else if (TEXT.includes(k)) this.text(k);
        else if (k === T.String && open !== undefined) {
          // Items after a failed line: they join the block before it, or are skipped.
          if (open === STRAY) this.i++;
          else this.items(open);
          this.open = open;
        } else {
          this.open = open ?? STRAY;
          this.fail(DOC);
        }
      });
    }
  }

  /** `EOL: NEWLINE+ | EOF` (the document loop takes the line breaks after the first). */
  private eol(): void {
    this.tested(LINE_END);
    const k = this.kind();
    if (k === Kind.EOF) return;
    if (k === Kind.Newline) {
      this.i++;
      return;
    }
    const prev = this.i - 1;
    const glued = this.kind(prev) === T.Title && this.t.end[prev] === this.t.start[this.i];
    if (glued) this.fail(LINE_END, 'write a blank between `title` and its text');
    this.fail(LINE_END, k === Kind.Error ? undefined : ONE_PER_LINE);
  }

  /** `DomainBlock: DOMAIN_NAME NEWLINE* (STRING NEWLINE*)*` */
  private block(): void {
    const j = this.i++;
    const name = this.domain(j);
    const nameRange = this.range(j);
    const base = `d:${name}`;
    const node: CynefinDomainNode = {
      id: this.id(base),
      type: 'Domain',
      range: { ...nameRange },
      name,
      nameRange,
      children: [],
    };
    const nodes = this.blocks.get(name);
    if (nodes) nodes.push(node);
    else this.blocks.set(name, [node]);
    // D367: the first block defines the domain, later blocks refer to it.
    this.state.symbol(name, 'domain', nameRange, nodes ? 'ref' : 'def');
    this.children.push(node);
    const span = this.state.beginStatement('domain', nameRange.start);
    this.items(node);
    this.state.endStatement(span, node.range.end);
    this.open = node;
  }

  /** `(NEWLINE* STRING)*`: the items of `node`; the line breaks after the last are left. */
  private items(node: CynefinDomainNode): void {
    for (;;) {
      let j = this.i;
      this.tested(IN_BLOCK, j);
      while (this.kind(j) === Kind.Newline) this.tested(IN_BLOCK, ++j);
      if (this.kind(j) !== T.String) return;
      this.i = j + 1;
      const range = this.range(j);
      const label = labelValue(this.raw(j));
      const id = this.id(`i:${node.name}/${esc(label)}`);
      node.children.push({ id, type: 'Item', range, label });
      checkLimit(
        this.state.diagnostics,
        'maxNodes',
        ++this.itemCount,
        this.options.maxNodes,
        'items',
        range
      );
      node.range.end = range.end;
      this.state.statement('item', range);
    }
  }

  /** `Transition: DOMAIN_NAME "-->" DOMAIN_NAME (":" STRING)? EOL` */
  private transition(): void {
    const fromToken = this.i;
    this.i += 2; // the domain name and `-->`, which `document()` saw
    const toToken = this.expect(T.DomainName, `a transition goes to a domain: ${DOMAIN_LIST}`);
    const from = this.domain(fromToken);
    const to = this.domain(toToken);
    const fromRange = this.range(fromToken);
    const toRange = this.range(toToken);
    const range = { start: fromRange.start, end: toRange.end };
    let label: string | undefined;
    let labelRange: Range | undefined;
    this.tested(AFTER_TARGET);
    if (this.kind() === T.Colon) {
      this.i++;
      const labelToken = this.expect(T.String, QUOTE_LABEL);
      labelRange = this.range(labelToken);
      label = labelValue(this.raw(labelToken));
      range.end = labelRange.end;
    }
    const node: CynefinTransitionNode = {
      id: this.edgeId(from, to),
      type: 'Transition',
      range,
      from,
      fromRange,
      to,
      toRange,
      ...(labelRange ? { label, labelRange } : {}),
    };
    this.children.push(node);
    this.state.statement('transition', range);
    checkLimit(
      this.state.diagnostics,
      'maxEdges',
      ++this.transitionCount,
      this.options.maxEdges,
      'transitions',
      range
    );
    this.state.symbol(from, 'domain', fromRange, 'ref');
    this.state.symbol(to, 'domain', toRange, 'ref');
    if (from === to) this.selfLoops.push(node);
    else {
      // v12's `t.label || undefined`: an empty label is none.
      const model: CynefinTransition = { from, to, ast: node.id, ...(label ? { label } : {}) };
      this.transitions.push(Object.freeze(model));
    }
    this.eol();
  }

  /** `(ACC_DESCR | ACC_TITLE | TITLE) EOL` */
  private text(k: number): void {
    const j = this.i++;
    const image = this.raw(j);
    const type = KIND_OF[k];
    if (type === undefined) throw new Error(`cynefin parser: token kind ${k} is not a statement`);
    const range = this.range(j);
    while (range.start < range.end && /[\t ]/.test(this.src[range.start] ?? '')) range.start++;
    let text: string;
    if (type === 'Title') text = this.title = titleValue(image);
    else if (type === 'AccTitle') text = this.accTitle = accTitleValue(image);
    else text = this.accDescr = accDescrValue(image);
    const kind = ID_OF[type];
    this.children.push({ id: this.id(kind), type, range, text });
    this.state.statement(kind, range);
    this.eol();
  }

  // ---- warnings -----------------------------------------------------------------------

  /** D364: one warning naming every block a later block of its domain replaced. */
  private warnDuplicates(): void {
    const replaced: CynefinDomainNode[] = [];
    for (const nodes of this.blocks.values()) replaced.push(...nodes.slice(0, -1));
    replaced.sort((a, b) => a.range.start - b.range.start);
    const first = replaced[0];
    if (!first) return;
    const named = replaced.map(
      (n) => `the \`${n.name}\` block at line ${this.lineOf(n.range.start)}`
    );
    const verb = replaced.length === 1 ? 'is' : 'are';
    this.state.diagnostics.warning(
      'CYNEFIN_DUPLICATE_DOMAIN',
      `Only the last block of a domain is drawn: ${listOf(named)} ${verb} replaced by a later block, and ${replaced.length === 1 ? 'its' : 'their'} items are not drawn. Put all the items of a domain in one block.`,
      first.nameRange
    );
  }

  /** D365: one warning naming every self-loop, which the model leaves out. */
  private warnSelfLoops(): void {
    const first = this.selfLoops[0];
    if (!first) return;
    const named = this.selfLoops.map(
      (n) => `\`${n.from} --> ${n.to}\` at line ${this.lineOf(n.range.start)}`
    );
    this.state.diagnostics.warning(
      'CYNEFIN_SELF_LOOP',
      `A transition from a domain to itself is not drawn: ${listOf(named)}. A transition goes from one domain to another.`,
      first.range
    );
  }
}
