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
import {
  ExpectedTable,
  ID_CONTROL,
  ID_RESERVED,
  idEscaper,
  Kind,
  kindSet,
  Probe,
  skipTo,
  STOP,
} from '@mermaid-js/core/parser-kit';
import {
  RuleParser,
  textProbeMode,
  textStatements,
  textValue,
  unclosedLabel,
  unreadAccessibility,
  withoutIndent,
} from '@mermaid-js/shared/parser/rule';
import type { AstId, ParseOptions, ParseResult, Range } from '@mermaid-js/core/parser-kit';
import type { RuleGrammar, TextValues } from '@mermaid-js/shared/parser/rule';
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
  CynefinTransitionNode,
} from './ast.ts';
import { labelValue } from './convert.ts';
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

/** `title`, `accTitle` and `accDescr` by token kind. */
const TEXTS = /* @__PURE__ */ textStatements(T.Title, T.AccTitle, T.AccDescr);

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

const GRAMMAR: RuleGrammar = {
  lex,
  trivia: CYNEFIN_TRIVIA,
  probeFollows: PROBE_FOLLOWS,
  probeMode: /* @__PURE__ */ textProbeMode({
    texts: TEXTS,
    accDescr: T.AccDescr,
    string: T.String,
  }),
};

/**
 * One parse. Each grammar rule is a method that returns what it read; a rule that fails
 * records a diagnostic and throws {@link STOP}, and the statement loop recovers.
 */
class CynefinParser extends RuleParser<PreprocessResult> {
  private readonly children: CynefinStatementNode[] = [];
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
  private readonly texts: TextValues = { title: '', accTitle: '', accDescr: '' };

  constructor(
    src: string,
    private readonly options: CynefinParseOptions
  ) {
    const given = options.preprocessed;
    super(src, given ?? preprocess(src), !given, GRAMMAR, options.probe);
  }

  parse(): CynefinParseResult {
    const { src } = this;
    const state = this.st;
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
    const title = this.texts.title || this.pre.frontMatter?.title;
    const model: CynefinModel = Object.freeze({
      domains: Object.freeze(domains),
      transitions: Object.freeze(this.transitions),
      ...(title ? { title } : {}),
      accTitle: this.texts.accTitle,
      accDescr: this.texts.accDescr,
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

  // ---- errors and recovery ------------------------------------------------------------

  /** Report what was found where one of `want` was expected, then stop the statement. */
  protected fail(want: readonly number[], hint?: string): never {
    const state = this.st;
    const where = this.range();
    if (this.kind() === Kind.Error) {
      this.badCharacters(this.i, hint);
      throw STOP;
    }
    state.diagnostics.unexpected(
      'UNEXPECTED',
      where,
      EXPECTED.names(want),
      this.found(),
      undefined,
      hint ?? this.explain()
    );
    throw STOP;
  }

  /**
   * Report the error token `j`, text no token rule matched: an unclosed string or `accDescr {`,
   * or stray characters.
   */
  private badCharacters(j: number, hint?: string): void {
    const state = this.st;
    const where = this.range(j);
    const text = this.raw(j);
    const line = this.lineOf(where.start);
    if (unclosedLabel(state.diagnostics, text, line, where)) return;
    if (unreadAccessibility(state.diagnostics, text, line, where)) return;
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
  protected override recover(): void {
    this.probe?.freeze();
    const end = skipTo(this.t, this.i, BOUNDARY);
    for (let j = this.i + 1; j < end; j++) if (this.kind(j) === Kind.Error) this.badCharacters(j);
    this.i = end;
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
    this.st.statement('header', range);
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
      this.tested(IN_BLOCK, j);
      while (this.kind(j) === Kind.Newline) this.tested(IN_BLOCK, ++j);
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
    const statement = TEXTS[k];
    if (!statement) throw new Error(`cynefin parser: token kind ${k} is not a statement`);
    const { type, word } = statement;
    const range = withoutIndent(this.src, this.range(j));
    const text = (this.texts[word] = textValue(type, this.raw(j)));
    this.children.push({ id: this.id(word), type, range, text });
    this.st.statement(word, range);
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
    this.st.diagnostics.warning(
      'CYNEFIN_SELF_LOOP',
      `A transition from a domain to itself is not drawn: ${listOf(named)}. A transition goes from one domain to another.`,
      first.range
    );
  }
}
