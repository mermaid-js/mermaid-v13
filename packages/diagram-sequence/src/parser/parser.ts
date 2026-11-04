/**
 * Sequence parser: recursive descent over the {@link lex} tokens (gated against v12's jison
 * lexer, #137), producing a {@link SequenceModel}, the typed AST, symbols, statement spans
 * and diagnostics (DESIGN §4.2).
 *
 * The grammar is v12's `sequenceDiagram.jison` (LALR), ported rule by rule, so it accepts and
 * rejects what jison does; `grammar/sequence.ebnf` is the normative form. Unlike jison it does
 * not stop at the first error: it reports it, skips to the next line break or `;` and carries
 * on (R-PARSE-4). Blocks (`loop … end`, `box … end`, …) are frames on a stack, not recursion,
 * so nesting depth is capped by a limit rather than the call stack.
 */
// cspell:words yytext
import {
  inKindSet,
  isSpace,
  Kind,
  LBRACE,
  ParseState,
  Probe,
  RBRACE,
  significantTokens,
} from '@mermaid-js/core/parser-kit';
import type {
  AstId,
  ParseOptions,
  ParseResult,
  Range,
  StatementSpan,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { DEFAULT_LIMITS, LIMIT_CODES } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type {
  ParticipantKind,
  SequenceFragment,
  SequenceMessage,
  SequenceModel,
} from '../model.ts';
import { ARROW_KINDS, ARROW_TOKENS } from './arrows.ts';
import {
  ACC_DESCR_VALUE,
  ACC_TITLE_VALUE,
  ACTOR,
  ACTOR_OR_LINK,
  AFTER_ACTOR,
  AFTER_ARROW,
  AFTER_AUTONUMBER,
  AFTER_CENTRAL_ARROW,
  AFTER_CONFIG,
  AFTER_NUM,
  AFTER_OVER,
  AFTER_PARTICIPANT,
  AS_REST,
  BOX_KINDS,
  CONFIG_CONTENT,
  CONFIG_END,
  DOC_KINDS,
  esc,
  FRAGMENTS,
  HEADER,
  HEADER_START,
  HINTS,
  KEYWORD_NAMES,
  MENUS,
  NEWLINE,
  PARSER_TRIVIA,
  PARTICIPANT_KEYWORDS,
  PLACEMENT_NAMES,
  PLACEMENTS,
  PROBE_FOLLOWS,
  REST,
  SECTION_NAMES,
  SECTION_OF,
  SECTION_OWNERS,
  STOP,
  TXT,
} from './tables.ts';
import type {
  SequenceBoxStmt,
  SequenceDocument,
  SequenceFragmentStmt,
  SequenceMenuStmt,
  SequenceParticipantRef,
  SequenceParticipantStmt,
  SequenceRectStmt,
  SequenceSectionStmt,
  SequenceStatementNode,
} from './ast.ts';
import { SequenceBuilder } from './builder.ts';
import type { DeclareParts } from './builder.ts';
import { lex } from './lexer.ts';
import {
  hasMath,
  KINDS,
  menuData,
  messageText,
  parseBoxData,
  parseMessage,
  participantData,
} from './normalise.ts';
import type { Wrapped } from './normalise.ts';
import { sourceView } from './source.ts';
import type { SourceView } from './source.ts';
import { T } from './tokens.ts';
import { TokenRules } from './rules.ts';

export interface SequenceParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
  /** Block nesting cap (core `DEFAULT_LIMITS.maxDepth`). */
  maxDepth?: number;
}

export type SequenceParseResult = ParseResult<SequenceModel, SequenceDocument>;

/** Parse a sequence diagram. Never throws: problems are error diagnostics. */
export function parseSequence(
  src: string,
  options: SequenceParseOptions = {}
): SequenceParseResult {
  return new SequenceParser(src, options).parse();
}

/** An open block: a fragment, a `rect` or a `box`, up to its `end`. */
interface Frame {
  /** The keyword token kind. */
  keyword: number;
  /** The keyword as written. */
  word: string;
  opener: Range;
  span: StatementSpan;
  node: SequenceFragmentStmt | SequenceRectStmt | SequenceBoxStmt;
  /** Where statements of the current section go. */
  body: SequenceStatementNode[];
  fragment?: SequenceFragment;
  section?: { node: SequenceSectionStmt; span: StatementSpan };
}

/**
 * One parse. Each grammar rule is a method; `i` indexes the significant tokens. A rule that
 * fails records a diagnostic and throws {@link STOP}; the statement loop catches it and
 * recovers.
 */
class SequenceParser extends TokenRules {
  private readonly pre: PreprocessResult;
  private readonly ids: ParseState['ids'];
  private readonly db: SequenceBuilder;
  private readonly fullTokens: TokenStream;
  private readonly children: SequenceStatementNode[] = [];
  private readonly frames: Frame[] = [];
  private readonly maxDepth: number;
  private readonly mentions = new Map<string, number>();
  private readonly pairs = new Map<string, number>();
  private readonly fragmentCount = new Map<string, number>();

  constructor(
    src: string,
    private readonly options: SequenceParseOptions
  ) {
    const pre = options.preprocessed ?? preprocess(src);
    const view = sourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    );
    const probe =
      options.probe === undefined ? undefined : new Probe(src, options.probe, PROBE_FOLLOWS);
    const fullTokens = lex(src, pre.bodyStart, view, probe);
    super(src, view, new ParseState(), significantTokens(fullTokens, PARSER_TRIVIA), probe);
    this.pre = pre;
    this.fullTokens = fullTokens;
    if (!options.preprocessed) this.st.diagnostics.list.push(...pre.diagnostics);
    this.ids = this.st.ids;
    const diagnostics = this.st.diagnostics;
    this.db = new SequenceBuilder({
      error: (code, message, range) => {
        diagnostics.error(code, message, range);
      },
      warn: (code, message, range) => {
        diagnostics.warning(code, message, range);
      },
    });
    this.maxDepth = options.maxDepth ?? DEFAULT_LIMITS.maxDepth;
    if (probe) {
      if (pre.frontMatter && probe.offset < pre.bodyStart) probe.outside('frontMatter');
      else probe.trivia(fullTokens);
    }
  }

  parse(): SequenceParseResult {
    const { st, db, src, options } = this;
    this.header();
    this.document();
    const warnings = st.diagnostics.list.filter((d) => d.severity === 'warning');
    const model = db.model(warnings);
    const ast: SequenceDocument = {
      id: 'doc',
      type: 'Document',
      range: { start: this.pre.bodyStart, end: src.length },
      children: this.children,
    };
    return st.result(model, ast, this.fullTokens, options, this.probe);
  }

  // ---- participants -------------------------------------------------------------------

  /** `p:<id>` for the first mention of a participant, `p:<id>@<n>` for the n-th. */
  private participantAst(name: string): AstId {
    const n = (this.mentions.get(name) ?? 0) + 1;
    this.mentions.set(name, n);
    const id = `p:${esc(name)}`;
    return n === 1 ? id : `${id}@${n}`;
  }

  /** A participant id token (jison `actor`: `ACTOR` or the `link` keyword). */
  private actor(want: readonly number[] = ACTOR_OR_LINK): [string, Range] {
    const j = this.expect(want);
    return [this.raw(j), this.range(j)];
  }

  /** A participant mentioned by a message, note or menu statement: v12 adds it. */
  private ref(name: string, range: Range, adds = true): SequenceParticipantRef {
    const first = !this.mentions.has(name);
    const id = this.participantAst(name);
    this.st.symbol(name, 'participant', range, first ? 'def' : 'ref');
    if (adds) this.db.mention(name, id, range);
    return { id, type: 'ParticipantRef', range, name };
  }

  /** `participant …`, `actor …` or `destroy …`, after an optional `create`. */
  private participantStatement(from: number, create: boolean): SequenceParticipantStmt {
    const { db, st } = this;
    const kw = this.kind();
    this.hint = HINTS[create ? T.Create : kw];
    this.expect(PARTICIPANT_KEYWORDS);
    const [name, nameRange] = this.actor(kw === T.Destroy ? ACTOR_OR_LINK : ACTOR);
    let data: [string, Range] | undefined;
    let alias: { text: string; range: Range } | undefined;
    if (kw !== T.Destroy) {
      this.tested(AFTER_PARTICIPANT);
      if (this.kind() === T.ConfigStart) {
        const open = this.i++;
        const content = this.expect(CONFIG_CONTENT);
        const close = this.expect(CONFIG_END);
        data = [this.raw(content).trim(), this.range(open, close)];
        this.tested(AFTER_CONFIG);
      }
      if (this.kind() === T.As) {
        this.i++;
        const rest = this.expect(AS_REST);
        alias = { text: this.raw(rest), range: this.range(rest) };
      }
    }
    const range = this.span(from);
    this.separator();
    const first = !this.mentions.has(name);
    const id = this.participantAst(name);
    const keyword = KEYWORD_NAMES[kw] ?? 'participant';
    const node: SequenceParticipantStmt = {
      id,
      type: 'Participant',
      range,
      keyword,
      name,
      nameRange,
    };
    if (create) node.create = true;
    if (alias) node.alias = alias;
    if (data) node.dataRange = data[1];
    st.symbol(name, 'participant', nameRange, first ? 'def' : 'ref');
    st.statement(create ? 'create' : keyword, range);
    if (kw === T.Destroy && !create) {
      db.destroy(name, id, range);
      return node;
    }
    const parts: DeclareParts = { id: name, ast: id, range };
    if (kw !== T.Destroy) parts.kind = keyword as ParticipantKind;
    if (alias) parts.description = parseMessage(alias.text);
    if (data) this.participantData(data[0], data[1], parts);
    if (create) db.create(parts);
    else db.declare(parts);
    return node;
  }

  /** The `@{ … }` data's `type` and `alias` (YAML errors are errors, unknown types warnings). */
  private participantData(text: string, range: Range, parts: DeclareParts): void {
    const d = participantData(text);
    if (d.error !== undefined) {
      this.st.diagnostics.error(
        'SEQUENCE_PARTICIPANT_DATA',
        `The participant data is not valid YAML: ${d.error}`,
        range
      );
    }
    if (d.unknownType !== undefined) {
      this.st.diagnostics.warning(
        'SEQUENCE_PARTICIPANT_TYPE',
        `Unknown participant type \`${d.unknownType}\`: it is drawn as a participant. Use one of ${KINDS.map((k) => `\`${k}\``).join(', ')}.`,
        range
      );
    }
    if (d.type) parts.dataType = d.type;
    if (d.alias !== undefined) parts.dataAlias = d.alias;
  }

  // ---- statements ---------------------------------------------------------------------

  /** Where the current statement's AST node goes. */
  private get body(): SequenceStatementNode[] {
    return this.frames[this.frames.length - 1]?.body ?? this.children;
  }

  /** `$$…$$` math in a text: kept as written, with a warning (D105). */
  private math(text: string, range: Range): void {
    if (!hasMath(text)) return;
    this.st.diagnostics.warning(
      'SEQUENCE_MATH',
      'Math (`$$…$$`) is not rendered yet: the text is shown as written.',
      range
    );
  }

  /** A message: `A->>B: text`, with `+`, `-` or `()` around the arrow. */
  private signal(from: number): void {
    const { db, st } = this;
    this.hint = HINTS[T.Actor];
    const [fromName, fromRange] = this.actor();
    let central: SequenceMessage['central'];
    let activation: SequenceMessage['activation'];
    const arrowFrom = this.i;
    this.tested(AFTER_ACTOR);
    if (this.kind() === T.Parens) {
      this.i++;
      central = 'from';
    }
    const arrowTok = this.expect(ARROW_TOKENS);
    this.tested(central ? AFTER_CENTRAL_ARROW : AFTER_ARROW);
    const k = this.kind();
    if (k === T.Parens) {
      this.i++;
      central = central ? 'both' : 'to';
    } else if (!central && (k === T.Plus || k === T.Minus)) {
      this.i++;
      activation = k === T.Plus ? 'activate' : 'deactivate';
    }
    const arrowRange = this.span(arrowFrom);
    const [toName, toRange] = this.actor();
    const txt = this.expect(TXT);
    this.separator();
    const range = this.range(from, txt);
    const refs = [this.ref(fromName, fromRange), this.ref(toName, toRange)];
    const pair = `${esc(fromName)}>${esc(toName)}`;
    const n = (this.pairs.get(pair) ?? 0) + 1;
    this.pairs.set(pair, n);
    const ast = n === 1 ? `m:${pair}` : `m:${pair}#${n}`;
    const text = messageText(this.raw(txt));
    const arrow = ARROW_KINDS[this.kind(arrowTok)] ?? 'solid';
    const m: { -readonly [K in keyof SequenceMessage]: SequenceMessage[K] } = {
      kind: 'message',
      ast,
      from: fromName,
      to: toName,
      text: text.text,
      arrow,
    };
    if (text.wrap !== undefined) m.wrap = text.wrap;
    if (activation) m.activation = activation;
    if (central) m.central = central;
    this.math(text.text, this.range(txt));
    db.message(m, range);
    if (activation === 'activate') db.activate(toName);
    else if (activation === 'deactivate') db.deactivate(fromName, arrowRange);
    st.statement('message', range);
    this.body.push({
      id: ast,
      type: 'Message',
      range,
      from: fromName,
      to: toName,
      arrow,
      text: text.text,
      arrowRange,
      children: refs,
    });
  }

  /** `note left of A: …`, `note right of A: …`, `note over A[,B]: …`. */
  private note(from: number): void {
    const { db, st } = this;
    this.hint = HINTS[T.Note];
    this.i++;
    const where = this.kind(this.expect(PLACEMENTS));
    const placement = PLACEMENT_NAMES[where] ?? 'over';
    const names: [string, Range][] = [this.actor()];
    if (where === T.Over) {
      this.tested(AFTER_OVER);
      if (this.kind() === T.Comma) {
        this.i++;
        names.push(this.actor());
      }
    }
    const txt = this.expect(TXT);
    this.separator();
    const range = this.range(from, txt);
    const refs = names.map(([n, r]) => this.ref(n, r));
    const ast = this.ids.statement('note');
    const text = messageText(this.raw(txt));
    const participants = names.map(([n]) => n) as [string] | [string, string];
    const note = { kind: 'note' as const, ast, placement, participants, text: text.text } as {
      kind: 'note';
      ast: AstId;
      placement: typeof placement;
      participants: typeof participants;
      text: string;
      wrap?: boolean;
    };
    if (text.wrap !== undefined) note.wrap = text.wrap;
    this.math(text.text, this.range(txt));
    db.statement(note);
    st.statement('note', range);
    this.body.push({ id: ast, type: 'Note', range, placement, text: text.text, children: refs });
  }

  /** `links A: …`, `link A: …`, `properties A: …`, `details A: …` (D105). */
  private menu(from: number): void {
    const { st } = this;
    const kw = this.kind();
    this.hint = HINTS[kw];
    this.i++;
    const [name, nameRange] = this.actor();
    const txt = this.expect(TXT);
    this.separator();
    const range = this.range(from, txt);
    const ref = this.ref(name, nameRange);
    const type = MENUS[kw] ?? 'Links';
    const text = messageText(this.raw(txt)).text;
    const node: SequenceMenuStmt = {
      id: this.ids.statement('st'),
      type,
      range,
      participant: name,
      text,
      children: [ref],
    };
    const data = menuData(type, text);
    if (data === undefined) {
      const example = type === 'Links' ? '`{"label": "url"}`' : '`{"key": "value"}`';
      st.diagnostics.warning(
        'SEQUENCE_MENU_DATA',
        `The \`${type.toLowerCase()}\` text is not a JSON object, so it is ignored: write it as ${example}.`,
        this.range(txt)
      );
    } else Object.assign(node, data);
    st.statement(type.toLowerCase(), range);
    this.body.push(node);
  }

  /** `activate A` / `deactivate A`: no participant is added (as v12). */
  private activation(from: number): void {
    const { db, st } = this;
    const kw = this.kind();
    this.hint = HINTS[kw];
    this.i++;
    const [name, nameRange] = this.actor();
    this.separator();
    const range = this.range(from, this.i - 2);
    const ref = this.ref(name, nameRange, false);
    const active = kw === T.Activate;
    const ast = this.ids.statement('st');
    if (active) db.activate(name);
    if (active || db.deactivate(name, range)) {
      db.statement({ kind: 'activation', ast, participant: name, active });
    }
    st.statement(active ? 'activate' : 'deactivate', range);
    this.body.push({ id: ast, type: 'Activation', range, active, children: [ref] });
  }

  /** `autonumber`, `autonumber N`, `autonumber N M`, `autonumber off`. */
  private autonumber(from: number): void {
    const { db, st } = this;
    this.hint = HINTS[T.Autonumber];
    this.i++;
    let start: number | undefined;
    let step: number | undefined;
    let visible = true;
    this.tested(AFTER_AUTONUMBER);
    if (this.kind() === T.Off) {
      this.i++;
      visible = false;
    } else if (this.kind() === T.Num) {
      start = Number(this.raw(this.i++));
      step = 1;
      this.tested(AFTER_NUM);
      if (this.kind() === T.Num) step = Number(this.raw(this.i++));
    }
    this.separator();
    const range = this.range(from, this.i - 2);
    const ast = this.ids.statement('st');
    const s: { kind: 'autonumber'; ast: AstId; start?: number; step?: number; visible: boolean } = {
      kind: 'autonumber',
      ast,
      visible,
    };
    if (start !== undefined) s.start = start;
    if (step !== undefined) s.step = step;
    db.statement(s);
    st.statement('autonumber', range);
    this.body.push({
      id: ast,
      type: 'Autonumber',
      range,
      visible,
      ...(start !== undefined ? { start } : {}),
      ...(step !== undefined ? { step } : {}),
    });
  }

  /** `title …`, `title: …`, `accTitle: …`, `accDescr: …`, `accDescr { … }`. */
  private text(from: number): void {
    const { db, st, src } = this;
    const k = this.kind();
    let type: 'Title' | 'AccTitle' | 'AccDescr';
    let text: string;
    let last = from;
    if (k === T.Title || k === T.LegacyTitle) {
      this.i++;
      type = 'Title';
      text = this.raw(from).slice(k === T.Title ? 6 : 7);
      db.title = text;
    } else if (k === T.AccTitle) {
      this.i++;
      last = this.expect(ACC_TITLE_VALUE);
      type = 'AccTitle';
      text = this.raw(last).trim();
      db.accTitle = text;
    } else if (k === T.AccDescr) {
      this.i++;
      last = this.expect(ACC_DESCR_VALUE);
      type = 'AccDescr';
      text = this.raw(last).trim().replace(/\n\s+/g, '\n');
      db.accDescr = text;
    } else {
      this.i++;
      type = 'AccDescr';
      text = this.raw(from).trim().replace(/\n\s+/g, '\n');
      db.accDescr = text;
    }
    const range = this.range(from, last);
    if (k === T.AccDescrMultilineValue) {
      // `accDescr {` and `}` have no tokens of their own here: take them into the range.
      let b = range.start;
      while (b > 0 && isSpace(src.charCodeAt(b - 1))) b--;
      if (src.charCodeAt(b - 1) === LBRACE) {
        b--;
        while (b > 0 && isSpace(src.charCodeAt(b - 1))) b--;
        if (src.slice(b - 8, b).toLowerCase() === 'accdescr') range.start = b - 8;
      }
      if (src.charCodeAt(range.end) === RBRACE) range.end++;
    }
    st.statement(type.charAt(0).toLowerCase() + type.slice(1), range);
    this.body.push({ id: this.ids.statement('st'), type, range, text });
  }

  /** One statement of a document (jison `statement`), at token `from`. */
  private statement(from: number): void {
    const k = this.kind();
    this.hint = undefined;
    if (k === T.Participant || k === T.ParticipantActor || k === T.Destroy) {
      this.body.push(this.participantStatement(from, false));
    } else if (k === T.Create) {
      this.hint = HINTS[T.Create];
      this.i++;
      this.tested(PARTICIPANT_KEYWORDS);
      if (!PARTICIPANT_KEYWORDS.includes(this.kind())) this.fail(PARTICIPANT_KEYWORDS);
      const node = this.participantStatement(this.i, true);
      node.range.start = this.start(from);
      this.body.push(node);
    } else if (k === T.Actor) {
      this.signal(from);
    } else if (k === T.Link && [...ARROW_TOKENS, T.Parens].includes(this.kind(from + 1))) {
      // `link` is also a participant id (jison `actor: ACTOR | 'link'`).
      this.signal(from);
    } else if (k === T.Note) {
      this.note(from);
    } else if (MENUS[k] !== undefined) {
      this.menu(from);
    } else if (k === T.Activate || k === T.Deactivate) {
      this.activation(from);
    } else if (k === T.Autonumber) {
      this.autonumber(from);
    } else if (
      k === T.Title ||
      k === T.LegacyTitle ||
      k === T.AccTitle ||
      k === T.AccDescr ||
      k === T.AccDescrMultilineValue
    ) {
      this.text(from);
    } else if (FRAGMENTS[k] !== undefined || k === T.Rect || k === T.Box) {
      this.open(from);
    } else {
      this.fail(DOC_KINDS);
    }
  }

  // ---- blocks -------------------------------------------------------------------------

  /** A block keyword and its text: `loop …`, `rect …`, `box …`, … Opens a frame. */
  private open(from: number): void {
    const { db, st, frames } = this;
    const k = this.kind();
    this.i++;
    const rest = this.expect(REST);
    const text = this.raw(rest);
    const opener = this.range(from, rest);
    const word = this.raw(from);
    const fragment = FRAGMENTS[k];
    const base = { id: '', range: { ...opener }, children: [] };
    let node: Frame['node'];
    let kind: string;
    let opened: SequenceFragment | undefined;
    if (fragment !== undefined) {
      const n = (this.fragmentCount.get(fragment) ?? 0) + 1;
      this.fragmentCount.set(fragment, n);
      const label: Wrapped = parseMessage(text);
      node = { ...base, id: `f:${fragment}#${n}`, type: 'Fragment', fragment, label: label.text };
      opened = db.openFragment(node.id, fragment, label);
      kind = fragment;
    } else if (k === T.Rect) {
      const color = parseMessage(text).text;
      node = { ...base, id: this.ids.statement('st'), type: 'Rect', color };
      db.openRect(node.id, color);
      kind = 'rect';
    } else {
      const data = parseBoxData(text);
      node = { ...base, id: this.ids.statement('box'), type: 'Box', label: data.text ?? '' };
      if (data.color !== 'transparent') node.color = data.color;
      db.openBox(node.id, data);
      kind = 'box';
    }
    const span = st.beginStatement(kind, opener.start);
    const body = node.children as SequenceStatementNode[];
    const frame: Frame = { keyword: k, word, opener, span, node, body };
    if (opened) frame.fragment = opened;
    this.body.push(frame.node);
    frames.push(frame);
    if (frames.length === this.maxDepth + 1) {
      st.diagnostics.error(
        LIMIT_CODES.maxDepth,
        `Blocks are nested ${frames.length} deep here, over the limit of ${this.maxDepth}. The limit is set by the page or app that renders the diagram.`,
        opener
      );
    }
  }

  /** `else …`, `and …` or `option …` inside its fragment. */
  private section(from: number): void {
    const { st, db } = this;
    const k = this.kind();
    const frame = this.frames[this.frames.length - 1];
    const fragment = frame?.fragment;
    if (!frame || !fragment || SECTION_OF[fragment.fragment] !== k) {
      const name = SECTION_NAMES[k] ?? '';
      const owner = SECTION_OWNERS[k] ?? '`critical`';
      const where = this.range(from);
      st.diagnostics.error(
        'UNEXPECTED_SECTION',
        `Unexpected \`${name}\`: it divides ${owner} blocks only${frame ? `, and the innermost open block here is \`${frame.word}\`` : ''}.`,
        where
      );
      throw STOP;
    }
    this.i++;
    const rest = this.expect(REST);
    const label = parseMessage(this.raw(rest));
    const range = this.range(from, rest);
    const ast = this.ids.statement('st');
    db.section(fragment, ast, label);
    if (frame.section) st.endStatement(frame.section.span, this.start(from));
    const node: SequenceSectionStmt = {
      id: ast,
      type: 'Section',
      range,
      label: label.text,
      children: [],
    };
    const span = st.beginStatement(SECTION_NAMES[k] ?? 'section', range.start);
    if (frame.section) frame.section.node.range.end = this.start(from);
    (frame.node.children as SequenceStatementNode[]).push(node);
    frame.body = node.children;
    frame.section = { node, span };
  }

  /** `end`: closes the innermost block. */
  private close(from: number): void {
    const { st, db, frames } = this;
    const frame = frames.pop();
    if (!frame) {
      st.diagnostics.error(
        'UNEXPECTED_END',
        'Unexpected `end`: there is no open block (`loop`, `alt`, `box`, …) to close here.',
        this.range(from)
      );
      this.i++;
      return;
    }
    this.i++;
    const end = this.end(from);
    this.closeFrame(frame, end);
    if (frame.keyword === T.Box) db.closeBox();
    else db.close();
  }

  private closeFrame(frame: Frame, end: number): void {
    if (frame.section) {
      frame.section.node.range.end = end;
    }
    frame.node.range.end = end;
    this.st.endStatement(frame.span, end);
  }

  /** The `box … end` body: participant statements and line breaks only (jison `box_section`). */
  private boxLine(from: number): void {
    const k = this.kind();
    if (PARTICIPANT_KEYWORDS.includes(k)) {
      this.body.push(this.participantStatement(from, false));
      return;
    }
    this.hint = 'a box holds `participant`, `actor` and `destroy` lines only, up to its `end`';
    this.fail(BOX_KINDS);
  }

  /** `sequenceDiagram`, after optional line breaks (jison `start`). */
  private header(): void {
    for (;;) {
      this.tested(HEADER_START);
      if (!inKindSet(NEWLINE, this.kind())) break;
      this.i++;
    }
    const from = this.i;
    try {
      this.tested(HEADER);
      if (this.kind() !== T.SD)
        this.fail(HEADER, 'a sequence diagram starts with `sequenceDiagram`');
      this.i++;
      const range = this.range(from);
      this.st.statement('header', range);
      this.children.push({ id: this.ids.statement('header'), type: 'Header', range });
    } catch (e) {
      if (e !== STOP) throw e;
      this.recover();
    }
  }

  /** The statements up to the end of the text, through every block (jison `document`). */
  private document(): void {
    const { frames, st, src } = this;
    for (;;) {
      const frame = frames[frames.length - 1];
      const inBox = frame?.keyword === T.Box;
      this.tested(inBox ? BOX_KINDS : DOC_KINDS);
      const k = this.kind();
      if (k === Kind.EOF) break;
      const from = this.i;
      try {
        if (inKindSet(NEWLINE, k) || (k === T.Invalid && !inBox)) this.i++;
        else if (k === T.End) this.close(from);
        else if (inBox) this.boxLine(from);
        else if (k === T.Else || k === T.And || k === T.Option) this.section(from);
        else this.statement(from);
      } catch (e) {
        if (e !== STOP) throw e;
        this.recover();
      }
    }
    while (frames.length > 0) {
      const frame = frames.pop() as Frame;
      const { word } = frame;
      st.diagnostics.error(
        'UNCLOSED_BLOCK',
        `Unclosed \`${word}\`: the \`${word}\` at line ${this.lineOf(frame.opener.start)} has no \`end\`. Add \`end\` to close it.`,
        frame.opener,
        {
          related: [
            { message: 'The text ends here.', range: { start: src.length, end: src.length } },
          ],
        }
      );
      this.closeFrame(frame, src.length);
      if (frame.keyword === T.Box) this.db.closeBox();
      else this.db.close();
    }
  }
}

export type { SourceView };
