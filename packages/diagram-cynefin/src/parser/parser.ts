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
 *
 * Two warnings, one per parse each (D226): `CYNEFIN_DUPLICATE_DOMAIN` names the blocks a later
 * block of the same domain replaced (D364), `CYNEFIN_SELF_LOOP` the `x --> x` transitions the
 * model leaves out (D365).
 */
import {
  cook,
  ExpectedTable,
  Kind,
  kindSet,
  LineIndex,
  ParseState,
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
}

export type CynefinParseResult = ParseResult<CynefinModel, CynefinDocument>;

const TEXT = [T.Title, T.AccTitle, T.AccDescr];
const HEADER = [T.Header, T.HeaderColon];
const DOC = [T.DomainName, ...TEXT, Kind.Newline, Kind.EOF];
const LINE_END = [Kind.Newline, Kind.EOF];

/** Where recovery resumes (R-PARSE-4). */
const BOUNDARY = kindSet(Kind.Newline, Kind.EOF);

const DOMAIN_NAMES: readonly CynefinDomainName[] = [
  'complex',
  'complicated',
  'clear',
  'chaotic',
  'confusion',
];
const DOMAIN_LIST = '`complex`, `complicated`, `clear`, `chaotic` or `confusion`';

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

/**
 * Thrown inside the parser after a diagnostic is recorded; caught at statement level. One
 * instance, so its stack is captured once.
 */
class Stop extends Error {}
const STOP = new Stop();

/** Items after a failed line that no block owns (see `CynefinParser.open`). */
const STRAY = 'stray';

/**
 * `%`, `>`, `@` and `#` percent-encoded, as in every AST id (DESIGN §4.2), and so are the
 * characters XML 1.0 cannot hold (C0 controls but tab, LF and CR; DEL; lone surrogates; U+FFFE,
 * U+FFFF), which a label can carry through `\0`, `\b`, `\f`, `\v` or the source. Two hex digits
 * up to U+007F, four above, so the encoding stays one-to-one.
 */
const ESCAPED = '%>@#\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f\\ud800-\\udfff\\ufffe\\uffff';
const RE_NEEDS_ESC = new RegExp(`[${ESCAPED}]`, 'u');
const RE_ESC = new RegExp(`[${ESCAPED}]`, 'gu');
/** Code units below this take two hex digits (`%00`…`%7F`), the rest four (`%D800`, `%FFFF`). */
const TWO_DIGITS = 0x80;
function esc(name: string): string {
  return RE_NEEDS_ESC.test(name)
    ? name.replace(RE_ESC, (c) => {
        const n = c.charCodeAt(0);
        return `%${n
          .toString(16)
          .toUpperCase()
          .padStart(n < TWO_DIGITS ? 2 : 4, '0')}`;
      })
    : name;
}

/** `a`, `a and b`, `a, b and c`. */
function and(parts: readonly string[]): string {
  if (parts.length < 2) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] ?? ''}`;
}

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
  private readonly st = new ParseState();
  private readonly children: CynefinStatementNode[] = [];
  private lines: LineIndex | undefined;
  /** Mentions per id base (`d:complex`, `i:complex/a`, `title`, …), for the `@n` suffixes. */
  private readonly mentions = new Map<string, number>();
  /** Every block of each domain, by name, in the order of each name's first block. */
  private readonly blocks = new Map<CynefinDomainName, CynefinDomainNode[]>();
  private readonly transitions: CynefinTransition[] = [];
  private readonly selfLoops: CynefinTransitionNode[] = [];
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
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    this.view = sourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    this.full = lex(src, pre.bodyStart, this.view);
    this.t = significantTokens(this.full, CYNEFIN_TRIVIA);
  }

  parse(): CynefinParseResult {
    const { st, src } = this;
    this.statement(() => this.header());
    this.document();
    this.warnDuplicates();
    this.warnSelfLoops();
    const warnings = st.diagnostics.list.filter((d) => d.severity === 'warning');
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
    return st.result(model, ast, this.full, this.options);
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

  /** Consume a token of `kind` and return its index, or fail. */
  private expect(kind: number, hint?: string): number {
    if (this.kind() !== kind) this.fail([kind], hint);
    return this.i++;
  }

  /** The domain name token `j` holds (the lexer matches only the five). */
  private domain(j: number): CynefinDomainName {
    const text = this.raw(j);
    return DOMAIN_NAMES.find((n) => n === text) ?? 'complex';
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
    const { st } = this;
    const where = this.range();
    if (this.kind() === Kind.Error) this.badCharacters(where, hint);
    const d = st.diagnostics.unexpected('UNEXPECTED', where, EXPECTED.names(want), this.found());
    const why = hint ?? this.explain();
    if (why) d.message = `${d.message.slice(0, -1)}; ${why}.`;
    throw STOP;
  }

  /** Text no token rule matched: an unclosed string or `accDescr {`, or stray characters. */
  private badCharacters(where: Range, hint: string | undefined): never {
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
    const why = hint ?? this.explainCharacters(text, where);
    st.diagnostics.error(
      'UNEXPECTED_CHARACTER',
      `Unexpected character \`${shown}\`${why ? `; ${why}` : ''}.`,
      where
    );
    throw STOP;
  }

  /** Why stray characters are not cynefin, where a likely cause shows. */
  private explainCharacters(text: string, where: Range): string | undefined {
    const lower = text.toLowerCase();
    const prev = this.i - 1;
    if (text === ';') return `\`;\` does not end a statement in a cynefin diagram: ${ONE_PER_LINE}`;
    if (/^\s/.test(text)) return 'only spaces, tabs and line breaks separate words';
    const glued = this.kind(prev) === T.DomainName && (this.t.end[prev] ?? -1) === where.start;
    if (glued && /^\w/.test(text)) {
      return `a domain is one of ${DOMAIN_LIST}, with a blank or a line break after it`;
    }
    if (DOMAIN_NAMES.some((n) => lower.startsWith(n) && !text.startsWith(n))) {
      return `domain names are written in lower case: ${DOMAIN_LIST}`;
    }
    if (DOMAIN_NAMES.some((n) => n.startsWith(text))) {
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

  /** Skip to the next line break after an error (R-PARSE-4). */
  private recover(): void {
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

  /** `NEWLINE* ("cynefin-beta" | "cynefin-beta:")` */
  private header(): void {
    while (this.kind() === Kind.Newline) this.i++;
    const k = this.kind();
    if (!HEADER.includes(k)) this.fail(HEADER);
    const range = this.range(this.i++);
    this.st.statement('header', range);
    this.children.push({ id: 'header', type: 'Header', range, colon: k === T.HeaderColon });
  }

  /** `(TitleAndAccessibilities | DomainBlock | Transition | NEWLINE)* EOF` */
  private document(): void {
    for (;;) {
      const k = this.kind();
      if (k === Kind.EOF) return;
      if (k === Kind.Newline) {
        this.i++;
        continue;
      }
      const open = this.open;
      this.open = undefined;
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
    this.st.symbol(name, 'domain', nameRange, nodes ? 'ref' : 'def');
    this.children.push(node);
    const span = this.st.beginStatement('domain', nameRange.start);
    this.items(node);
    this.st.endStatement(span, node.range.end);
    this.open = node;
  }

  /** `(NEWLINE* STRING)*`: the items of `node`; the line breaks after the last are left. */
  private items(node: CynefinDomainNode): void {
    for (;;) {
      let j = this.i;
      while (this.kind(j) === Kind.Newline) j++;
      if (this.kind(j) !== T.String) return;
      this.i = j + 1;
      const range = this.range(j);
      const label = labelValue(this.raw(j));
      const id = this.id(`i:${node.name}/${esc(label)}`);
      node.children.push({ id, type: 'Item', range, label });
      node.range.end = range.end;
      this.st.statement('item', range);
    }
  }

  /** `Transition: DOMAIN_NAME "-->" DOMAIN_NAME (":" STRING)? EOL` */
  private transition(): void {
    const f = this.i;
    this.i += 2;
    const t = this.expect(T.DomainName, `a transition goes to a domain: ${DOMAIN_LIST}`);
    const from = this.domain(f);
    const to = this.domain(t);
    const fromRange = this.range(f);
    const toRange = this.range(t);
    const range = { start: fromRange.start, end: toRange.end };
    let label: string | undefined;
    let labelRange: Range | undefined;
    if (this.kind() === T.Colon) {
      this.i++;
      const s = this.expect(T.String, QUOTE_LABEL);
      labelRange = this.range(s);
      label = labelValue(this.raw(s));
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
    this.st.statement('transition', range);
    this.st.symbol(from, 'domain', fromRange, 'ref');
    this.st.symbol(to, 'domain', toRange, 'ref');
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
    this.st.diagnostics.warning(
      'CYNEFIN_DUPLICATE_DOMAIN',
      `Only the last block of a domain is drawn: ${and(named)} ${verb} replaced by a later block, and ${replaced.length === 1 ? 'its' : 'their'} items are not drawn. Put all the items of a domain in one block.`,
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
    this.st.diagnostics.warning(
      'CYNEFIN_SELF_LOOP',
      `A transition from a domain to itself is not drawn: ${and(named)}. A transition goes from one domain to another.`,
      first.range
    );
  }
}
