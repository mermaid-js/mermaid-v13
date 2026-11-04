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

function tokenize(src: string): { toks: Tok[]; fileDoc: string | undefined } {
  const toks: Tok[] = [];
  let doc: string | undefined;
  let fileDoc: string | undefined;
  let line = 1;
  let i = 0;
  const err = (msg: string): never => {
    throw new SyntaxError(`grammar line ${line}: ${msg}`);
  };
  const push = (k: Tok['k'], v: string) => {
    const t: Tok = { k, v, line };
    if (doc !== undefined) t.doc = doc;
    doc = undefined;
    toks.push(t);
  };
  while (i < src.length) {
    const c = src[i] ?? '';
    if (c === '\n') {
      line++;
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (src.startsWith('(*', i)) {
      const e = src.indexOf('*)', i + 2);
      if (e < 0) err('unclosed comment');
      const body = src.slice(i + 2, e);
      if (body.startsWith('*')) {
        const text = body
          .slice(1)
          .split('\n')
          .map((l) => l.trim())
          .join('\n')
          .trim();
        if (toks.length === 0 && fileDoc === undefined) fileDoc = text;
        else doc = text;
      }
      for (const ch of body) if (ch === '\n') line++;
      i = e + 2;
      continue;
    }
    if (c === '@') {
      const m = /^@[A-Za-z][\w-]*/.exec(src.slice(i));
      if (!m) err('expected a name after @');
      push('at', (m as RegExpExecArray)[0].slice(1));
      i += (m as RegExpExecArray)[0].length;
      continue;
    }
    if (c === '<') {
      const e = src.indexOf('>', i);
      if (e < 0) err('unclosed <modes>');
      push('modes', src.slice(i + 1, e));
      i = e + 1;
      continue;
    }
    if (c === '/') {
      let j = i + 1;
      let cls = false;
      for (; j < src.length; j++) {
        const d = src[j];
        if (d === '\\') j++;
        else if (d === '[') cls = true;
        else if (d === ']') cls = false;
        else if (d === '/' && !cls) break;
      }
      if (j >= src.length) err('unclosed regex');
      // A long regex may be broken over lines: a line break and the indent after it vanish.
      const body = src.slice(i + 1, j);
      push('regex', body.replace(/\n\s*/g, ''));
      for (const ch of body) if (ch === '\n') line++;
      i = j + 1;
      continue;
    }
    if (c === ':') {
      const m = /^:([A-Za-z][\w.-]*)/.exec(src.slice(i));
      if (!m) err('expected a scope after :');
      push('scope', (m as RegExpExecArray)[1] ?? '');
      i += (m as RegExpExecArray)[0].length;
      continue;
    }
    const w = /^[A-Za-z_][\w-]*(?:\([\w-]*\))?/.exec(src.slice(i));
    if (w) {
      push('word', w[0]);
      i += w[0].length;
      continue;
    }
    if (PUNCT.has(c)) {
      push('punct', c);
      i++;
      continue;
    }
    err(`unexpected character ${JSON.stringify(c)}`);
  }
  return { toks, fileDoc };
}

const ACTIONS = new Set(['pop', 'empty', 'fold', 'attach-next', 'attach-prev']);

/** Parse a grammar file. Throws a SyntaxError with the line on malformed input. */
export function parseGrammar(src: string): Grammar {
  const { toks, fileDoc } = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const err = (msg: string, t = peek()): never => {
    throw new SyntaxError(`grammar line ${t?.line ?? '?'}: ${msg}`);
  };
  const expectPunct = (v: string) => {
    const t = peek();
    if (t?.k !== 'punct' || t.v !== v) err(`expected \`${v}\``);
    p++;
  };

  const modes: string[] = [];
  let ignoreCase = false;
  const lexRules: LexRule[] = [];
  const triviaRules: LexRule[] = [];
  const tokens: string[] = [];
  const rules: GrammarRule[] = [];
  let section: 'lexer' | 'trivia' | 'grammar' | undefined;

  while (p < toks.length) {
    const t = toks[p] as Tok;
    if (t.k === 'at' && (t.v === 'lexer' || t.v === 'trivia' || t.v === 'grammar')) {
      section = t.v;
      p++;
      continue;
    }
    if (section === undefined) err('expected @lexer, @trivia or @grammar');
    if (section === 'lexer' || section === 'trivia') {
      if (t.k === 'at' && t.v === 'modes') {
        p++;
        while (peek()?.k === 'word') modes.push((toks[p++] as Tok).v);
        expectPunct(';');
        continue;
      }
      if (t.k === 'at' && t.v === 'options') {
        p++;
        while (peek()?.k === 'word') {
          const o = toks[p++] as Tok;
          if (o.v === 'case-insensitive') ignoreCase = true;
          else err(`unknown lexer option \`${o.v}\``, o);
        }
        expectPunct(';');
        continue;
      }
      const doc = t.doc;
      let ruleModes = ['INITIAL'];
      if (t.k === 'modes') {
        ruleModes = t.v.split(',').map((m) => m.trim());
        p++;
      }
      const nameTok = peek();
      let name: string | undefined;
      if (nameTok?.k === 'word') name = nameTok.v;
      else if (!(nameTok?.k === 'punct' && nameTok.v === '-')) err('expected a token name or -');
      p++;
      const re = peek();
      if (re?.k !== 'regex') err('expected /regex/');
      p++;
      const actions: LexAction[] = [];
      let scope: string | undefined;
      while (peek()?.k === 'word' || peek()?.k === 'scope') {
        const a = toks[p++] as Tok;
        if (a.k === 'scope') {
          scope = a.v;
          continue;
        }
        const m = /^(push|push-once)\(([\w-]+)\)$/.exec(a.v);
        if (m) actions.push({ op: m[1] as 'push', mode: m[2] ?? '' });
        else if (ACTIONS.has(a.v)) actions.push({ op: a.v as LexAction['op'] });
        else err(`unknown lexer action \`${a.v}\``, a);
      }
      expectPunct(';');
      for (const m of ruleModes) {
        if (m !== '*' && m !== 'INITIAL' && !modes.includes(m)) err(`unknown mode \`${m}\``, t);
      }
      for (const a of actions) {
        if (a.mode !== undefined && !modes.includes(a.mode)) err(`unknown mode \`${a.mode}\``, t);
      }
      try {
        new RegExp((re as Tok).v, 'y');
      } catch (e) {
        err(`bad regex: ${(e as Error).message}`, re);
      }
      const into = section === 'trivia' ? triviaRules : lexRules;
      if (section === 'lexer' && name !== undefined && !tokens.includes(name)) tokens.push(name);
      into.push({
        index: into.length,
        modes: ruleModes,
        name,
        pattern: (re as Tok).v,
        actions,
        scope,
        doc,
      });
      continue;
    }
    // grammar rule
    if (t.k !== 'word') err('expected a rule name');
    p++;
    let ast: string | undefined;
    if (peek()?.k === 'at') ast = (toks[p++] as Tok).v;
    expectPunct('=');
    const body = alt();
    expectPunct(';');
    rules.push({ name: t.v, ast, body, doc: t.doc });
  }

  function alt(): Expr {
    const alts = [seq()];
    while (peek()?.k === 'punct' && peek()?.v === '|') {
      p++;
      alts.push(seq());
    }
    return alts.length === 1 ? (alts[0] as Expr) : { t: 'alt', alts };
  }
  function seq(): Expr {
    const items: Expr[] = [];
    for (;;) {
      const t = peek();
      if (!t) break;
      let e: Expr;
      if (t.k === 'word') {
        p++;
        e = { t: 'sym', name: t.v };
      } else if (t.k === 'punct' && (t.v === '(' || t.v === '[' || t.v === '{')) {
        p++;
        const inner = alt();
        const close = t.v === '(' ? ')' : t.v === '[' ? ']' : '}';
        expectPunct(close);
        e =
          t.v === '('
            ? inner
            : t.v === '['
              ? { t: 'opt', e: inner }
              : { t: 'rep', e: inner, min: 0 };
      } else break;
      const q = peek();
      if (q?.k === 'punct' && (q.v === '*' || q.v === '+' || q.v === '?')) {
        p++;
        e = q.v === '?' ? { t: 'opt', e } : { t: 'rep', e, min: q.v === '+' ? 1 : 0 };
      }
      items.push(e);
    }
    return items.length === 1 ? (items[0] as Expr) : { t: 'seq', items };
  }

  const first = rules[0];
  if (!first) throw new SyntaxError('grammar: no grammar rules');
  const g: Grammar = {
    doc: fileDoc,
    modes,
    ignoreCase,
    lexRules,
    triviaRules,
    tokens,
    rules,
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
