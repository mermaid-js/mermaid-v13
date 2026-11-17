// cspell:words punct toks
/**
 * Reader for the grammar files `packages/diagram-<type>/grammar/<type>.ebnf` (DESIGN §4.4,
 * R-PARSE-9). A grammar file has two sections.
 *
 * `@lexer`: lexer modes (jison start conditions) and ordered token rules.
 *
 *     @modes string text … ;                      exclusive modes; INITIAL is implicit
 *     \@options case-insensitive ;                 every rule ignores case (jison's option)
 *     <modes> NAME /regex/ action… :scope ;       one token rule
 *
 * - `<a,b>` lists the modes a rule applies in, `<*>` every mode; no list means INITIAL.
 * - The first rule (in file order) that matches at the current offset wins, as in jison.
 * - NAME `-` emits no token. Actions: `push(m)`, `pop`, `push-once(m)` (push only the first
 *   time the rule fires), `empty` (the token's image is empty), `fold` (line breaks and the
 *   blanks after them read as `<br/>`), `attach-next` / `attach-prev` (a `-` rule whose text
 *   counts towards the next / previous token's range, e.g. the quotes around a string).
 * - `:scope` is the highlighting scope (keyword, string, operator, …) for the highlighters.
 *
 * `@trivia`: rules in the same format for text the preprocess layer removes before lexing
 * (comments, directives). The reference lexer never sees them; highlighters add them to
 * every mode.
 *
 * `@grammar`: EBNF rules over those token names.
 *
 *     name = a b | c [ d ] { e } f? g* h+ ( i | j ) ;
 *     name @Type = … ;                            the rule builds an AST node of that type
 *
 * The first grammar rule is the start rule. `(* … *)` is a comment; `(** … *)` documents the
 * rule or token that follows (it lands in the syntax reference).
 */

export interface LexAction {
  op: 'push' | 'pop' | 'push-once' | 'empty' | 'fold' | 'attach-next' | 'attach-prev';
  mode?: string;
}

export interface LexRule {
  /** Index in file order (rule priority). */
  index: number;
  /** Modes the rule applies in; `['*']` for all. */
  modes: string[];
  /** Token name, or undefined for a rule that emits no token. */
  name: string | undefined;
  /** Regex source (JavaScript syntax). */
  pattern: string;
  actions: LexAction[];
  scope: string | undefined;
  doc: string | undefined;
}

export type Expr =
  | { t: 'sym'; name: string }
  | { t: 'seq'; items: Expr[] }
  | { t: 'alt'; alts: Expr[] }
  | { t: 'opt'; e: Expr }
  | { t: 'rep'; e: Expr; min: 0 | 1 };

export interface GrammarRule {
  name: string;
  /** AST node type the rule builds, if any. */
  ast: string | undefined;
  body: Expr;
  doc: string | undefined;
}

export interface Grammar {
  /** Title line(s): the file's leading `(** … *)` comment. */
  doc: string | undefined;
  modes: string[];
  /** `@options case-insensitive`: every lexer rule ignores case (regex flag `i`). */
  ignoreCase: boolean;
  lexRules: LexRule[];
  /** Highlighting-only rules for text removed before lexing. */
  triviaRules: LexRule[];
  /** Every token name the lexer can emit, in first-declared order. */
  tokens: string[];
  rules: GrammarRule[];
  start: string;
}

interface Tok {
  k: 'word' | 'at' | 'regex' | 'scope' | 'modes' | 'punct';
  v: string;
  line: number;
  doc?: string;
}

const PUNCT = new Set(['=', '|', '(', ')', '[', ']', '{', '}', ';', '*', '+', '?', '-']);

/** The scanner's position: what `tokenize` threads through its per-token helpers. */
interface Scan {
  readonly src: string;
  readonly toks: Tok[];
  doc: string | undefined;
  fileDoc: string | undefined;
  line: number;
  i: number;
}

function scanErr(st: Scan, msg: string): never {
  throw new SyntaxError(`grammar line ${st.line}: ${msg}`);
}

function scanPush(st: Scan, k: Tok['k'], v: string): void {
  const t: Tok = { k, v, line: st.line };
  if (st.doc !== undefined) t.doc = st.doc;
  st.doc = undefined;
  st.toks.push(t);
}

function countLines(st: Scan, body: string): void {
  for (const ch of body) if (ch === '\n') st.line++;
}

/** `(* … *)`; a `(** … *)` one is a doc comment for the next token (or the file's title). */
function scanComment(st: Scan): void {
  const e = st.src.indexOf('*)', st.i + 2);
  if (e < 0) scanErr(st, 'unclosed comment');
  const body = st.src.slice(st.i + 2, e);
  if (body.startsWith('*')) {
    const text = body
      .slice(1)
      .split('\n')
      .map((l) => l.trim())
      .join('\n')
      .trim();
    if (st.toks.length === 0 && st.fileDoc === undefined) st.fileDoc = text;
    else st.doc = text;
  }
  countLines(st, body);
  st.i = e + 2;
}

function scanAt(st: Scan): void {
  const m = /^@[A-Za-z][\w-]*/.exec(st.src.slice(st.i));
  if (!m) scanErr(st, 'expected a name after @');
  scanPush(st, 'at', m[0].slice(1));
  st.i += m[0].length;
}

function scanModes(st: Scan): void {
  const e = st.src.indexOf('>', st.i);
  if (e < 0) scanErr(st, 'unclosed <modes>');
  scanPush(st, 'modes', st.src.slice(st.i + 1, e));
  st.i = e + 1;
}

function scanRegex(st: Scan): void {
  const { src } = st;
  let j = st.i + 1;
  let cls = false;
  for (; j < src.length; j++) {
    const d = src[j];
    if (d === '\\') j++;
    else if (d === '[') cls = true;
    else if (d === ']') cls = false;
    else if (d === '/' && !cls) break;
  }
  if (j >= src.length) scanErr(st, 'unclosed regex');
  // A long regex may be broken over lines: a line break and the indent after it vanish.
  const body = src.slice(st.i + 1, j);
  scanPush(st, 'regex', body.replace(/\n\s*/g, ''));
  countLines(st, body);
  st.i = j + 1;
}

function scanScope(st: Scan): void {
  const m = /^:([A-Za-z][\w.-]*)/.exec(st.src.slice(st.i));
  if (!m) scanErr(st, 'expected a scope after :');
  scanPush(st, 'scope', m[1] ?? '');
  st.i += m[0].length;
}

function scanWordOrPunct(st: Scan, c: string): void {
  const w = /^[A-Za-z_][\w-]*(?:\([\w-]*\))?/.exec(st.src.slice(st.i));
  if (w) {
    scanPush(st, 'word', w[0]);
    st.i += w[0].length;
  } else if (PUNCT.has(c)) {
    scanPush(st, 'punct', c);
    st.i++;
  } else {
    scanErr(st, `unexpected character ${JSON.stringify(c)}`);
  }
}

function tokenize(src: string): { toks: Tok[]; fileDoc: string | undefined } {
  const st: Scan = { src, toks: [], doc: undefined, fileDoc: undefined, line: 1, i: 0 };
  while (st.i < src.length) {
    const c = src[st.i] ?? '';
    if (c === '\n') {
      st.line++;
      st.i++;
    } else if (/\s/.test(c)) st.i++;
    else if (src.startsWith('(*', st.i)) scanComment(st);
    else if (c === '@') scanAt(st);
    else if (c === '<') scanModes(st);
    else if (c === '/') scanRegex(st);
    else if (c === ':') scanScope(st);
    else scanWordOrPunct(st, c);
  }
  return { toks: st.toks, fileDoc: st.fileDoc };
}

const ACTIONS = new Set(['pop', 'empty', 'fold', 'attach-next', 'attach-prev']);
const CLOSER: Readonly<Record<string, string>> = { '(': ')', '[': ']', '{': '}' };

/** Recursive descent over the token list; the lexer and grammar sections fill the lists. */
class GrammarParser {
  readonly toks: Tok[];
  p = 0;
  readonly modes: string[] = [];
  ignoreCase = false;
  readonly lexRules: LexRule[] = [];
  readonly triviaRules: LexRule[] = [];
  readonly tokens: string[] = [];
  readonly rules: GrammarRule[] = [];

  constructor(toks: Tok[]) {
    this.toks = toks;
  }

  peek(): Tok | undefined {
    return this.toks[this.p];
  }

  err(msg: string, t = this.peek()): never {
    throw new SyntaxError(`grammar line ${t?.line ?? '?'}: ${msg}`);
  }

  expectPunct(v: string): void {
    const t = this.peek();
    if (t?.k !== 'punct' || t.v !== v) this.err(`expected \`${v}\``);
    this.p++;
  }

  /** `@modes a b;` or `@options case-insensitive;`; false when `t` is neither. */
  directive(t: Tok): boolean {
    if (t.k !== 'at' || (t.v !== 'modes' && t.v !== 'options')) return false;
    this.p++;
    while (this.peek()?.k === 'word') {
      const o = this.toks[this.p++] as Tok;
      if (t.v === 'modes') this.modes.push(o.v);
      else if (o.v === 'case-insensitive') this.ignoreCase = true;
      else this.err(`unknown lexer option \`${o.v}\``, o);
    }
    this.expectPunct(';');
    return true;
  }

  /** The actions and scope after a lexer rule's regex. */
  lexTail(): { actions: LexAction[]; scope: string | undefined } {
    const actions: LexAction[] = [];
    let scope: string | undefined;
    while (this.peek()?.k === 'word' || this.peek()?.k === 'scope') {
      const a = this.toks[this.p++] as Tok;
      if (a.k === 'scope') {
        scope = a.v;
        continue;
      }
      const m = /^(push|push-once)\(([\w-]+)\)$/.exec(a.v);
      if (m) actions.push({ op: m[1] as 'push', mode: m[2] ?? '' });
      else if (ACTIONS.has(a.v)) actions.push({ op: a.v as LexAction['op'] });
      else this.err(`unknown lexer action \`${a.v}\``, a);
    }
    return { actions, scope };
  }

  /** The modes a lexer rule is active in, and the token that follows its `<modes>` prefix. */
  ruleModes(t: Tok): string[] {
    if (t.k !== 'modes') return ['INITIAL'];
    this.p++;
    return t.v.split(',').map((m) => m.trim());
  }

  /** Every mode a rule names (its own and its `push` targets) is declared. */
  checkModes(t: Tok, ruleModes: string[], actions: LexAction[]): void {
    for (const m of ruleModes) {
      if (m !== '*' && m !== 'INITIAL' && !this.modes.includes(m)) {
        this.err(`unknown mode \`${m}\``, t);
      }
    }
    for (const a of actions) {
      if (a.mode !== undefined && !this.modes.includes(a.mode)) {
        this.err(`unknown mode \`${a.mode}\``, t);
      }
    }
  }

  /** One `<modes> NAME /regex/ actions :scope;` rule of the lexer or trivia section. */
  lexRule(t: Tok, section: 'lexer' | 'trivia'): void {
    const doc = t.doc;
    const ruleModes = this.ruleModes(t);
    const nameTok = this.peek();
    let name: string | undefined;
    if (nameTok?.k === 'word') name = nameTok.v;
    else if (!(nameTok?.k === 'punct' && nameTok.v === '-')) this.err('expected a token name or -');
    this.p++;
    const re = this.peek();
    if (re?.k !== 'regex') this.err('expected /regex/');
    this.p++;
    const { actions, scope } = this.lexTail();
    this.expectPunct(';');
    this.checkModes(t, ruleModes, actions);
    try {
      new RegExp(re.v, 'y');
    } catch (e) {
      this.err(`bad regex: ${(e as Error).message}`, re);
    }
    const into = section === 'trivia' ? this.triviaRules : this.lexRules;
    if (section === 'lexer' && name !== undefined && !this.tokens.includes(name)) {
      this.tokens.push(name);
    }
    into.push({
      index: into.length,
      modes: ruleModes,
      name,
      pattern: re.v,
      actions,
      scope,
      doc,
    });
  }

  grammarRule(t: Tok): void {
    if (t.k !== 'word') this.err('expected a rule name');
    this.p++;
    let ast: string | undefined;
    if (this.peek()?.k === 'at') ast = (this.toks[this.p++] as Tok).v;
    this.expectPunct('=');
    const body = this.alt();
    this.expectPunct(';');
    this.rules.push({ name: t.v, ast, body, doc: t.doc });
  }

  alt(): Expr {
    const alts = [this.seq()];
    while (this.peek()?.k === 'punct' && this.peek()?.v === '|') {
      this.p++;
      alts.push(this.seq());
    }
    return alts.length === 1 ? (alts[0] as Expr) : { t: 'alt', alts };
  }

  /** `( … )`, `[ … ]` or `{ … }`: a group, an option or a repetition. */
  group(t: Tok): Expr {
    this.p++;
    const inner = this.alt();
    this.expectPunct(CLOSER[t.v] ?? '');
    if (t.v === '(') return inner;
    return t.v === '[' ? { t: 'opt', e: inner } : { t: 'rep', e: inner, min: 0 };
  }

  seq(): Expr {
    const items: Expr[] = [];
    for (;;) {
      const t = this.peek();
      if (!t) break;
      let e: Expr;
      if (t.k === 'word') {
        this.p++;
        e = { t: 'sym', name: t.v };
      } else if (t.k === 'punct' && (t.v === '(' || t.v === '[' || t.v === '{')) {
        e = this.group(t);
      } else break;
      const q = this.peek();
      if (q?.k === 'punct' && (q.v === '*' || q.v === '+' || q.v === '?')) {
        this.p++;
        e = q.v === '?' ? { t: 'opt', e } : { t: 'rep', e, min: q.v === '+' ? 1 : 0 };
      }
      items.push(e);
    }
    return items.length === 1 ? (items[0] as Expr) : { t: 'seq', items };
  }

  run(): void {
    let section: 'lexer' | 'trivia' | 'grammar' | undefined;
    while (this.p < this.toks.length) {
      const t = this.toks[this.p] as Tok;
      if (t.k === 'at' && (t.v === 'lexer' || t.v === 'trivia' || t.v === 'grammar')) {
        section = t.v;
        this.p++;
      } else if (section === undefined) {
        this.err('expected @lexer, @trivia or @grammar');
      } else if (section === 'grammar') {
        this.grammarRule(t);
      } else if (!this.directive(t)) {
        this.lexRule(t, section);
      }
    }
  }
}

/** Parse a grammar file. Throws a SyntaxError with the line on malformed input. */
export function parseGrammar(src: string): Grammar {
  const { toks, fileDoc } = tokenize(src);
  const parser = new GrammarParser(toks);
  parser.run();
  const first = parser.rules[0];
  if (!first) throw new SyntaxError('grammar: no grammar rules');
  const g: Grammar = {
    doc: fileDoc,
    modes: parser.modes,
    ignoreCase: parser.ignoreCase,
    lexRules: parser.lexRules,
    triviaRules: parser.triviaRules,
    tokens: parser.tokens,
    rules: parser.rules,
    start: first.name,
  };
  checkGrammar(g);
  return g;
}

/** Every symbol is a token or a rule; every rule is reachable from the start rule. */
function checkGrammar(g: Grammar): void {
  const names = new Map(g.rules.map((r) => [r.name, r]));
  if (names.size !== g.rules.length) throw new SyntaxError('grammar: duplicate rule name');
  const tokens = new Set(g.tokens);
  const seen = new Set<string>();
  const visit = (e: Expr): void => {
    switch (e.t) {
      case 'sym':
        if (tokens.has(e.name)) return;
        if (!names.has(e.name)) throw new SyntaxError(`grammar: unknown symbol \`${e.name}\``);
        if (!seen.has(e.name)) {
          seen.add(e.name);
          visit((names.get(e.name) as GrammarRule).body);
        }
        return;
      case 'seq':
        e.items.forEach(visit);
        return;
      case 'alt':
        e.alts.forEach(visit);
        return;
      case 'opt':
      case 'rep':
        visit(e.e);
    }
  };
  seen.add(g.start);
  visit((names.get(g.start) as GrammarRule).body);
  const unused = g.rules.filter((r) => !seen.has(r.name)).map((r) => r.name);
  if (unused.length > 0) throw new SyntaxError(`grammar: unreachable rules ${unused.join(', ')}`);
}

/** Symbols of an expression, flattened (for tooling). */
export function symbolsOf(e: Expr, out: string[] = []): string[] {
  switch (e.t) {
    case 'sym':
      out.push(e.name);
      break;
    case 'seq':
      e.items.forEach((x) => symbolsOf(x, out));
      break;
    case 'alt':
      e.alts.forEach((x) => symbolsOf(x, out));
      break;
    case 'opt':
    case 'rep':
      symbolsOf(e.e, out);
  }
  return out;
}
