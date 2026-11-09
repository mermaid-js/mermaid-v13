/**
 * The shared jison lexer oracle (lexer-parity gate, parser-method §1, D212): v12's own jison
 * lexer for one diagram type, run on exactly the text v12's parser for that type received.
 *
 * We capture that text by wrapping the lexer's `setInput` while the v12 oracle parses, then
 * re-run the lexer on it with a fresh `yy` (from the type's descriptor in `./types.ts`).
 *
 * Calls must be sequential (await each one before the next), across every type: each type's
 * captured text is one variable shared by its calls, and v12 is a single shared instance.
 */
import { loadOracle } from '../oracle.ts';
import { JISON_TYPES } from './types.ts';
import type { JisonLexer, JisonType, JisonTypeDescriptor } from './types.ts';

export type { JisonType, JisonTypeDescriptor } from './types.ts';
export { JISON_TYPES } from './types.ts';

/** A jison terminal name and the text it matched (`yytext` after the rule's action). */
export type JisonToken = [name: string, image: string];

/**
 * The name the oracle gives the point where jison threw (no rule matched, or a lexer action
 * threw); the stream stops there. It is no jison terminal, so it never clashes with a
 * grammar's own `INVALID` or `ERROR` token.
 */
export const LEXICAL_ERROR = 'LEXICAL_ERROR';

export interface TokensOptions {
  /**
   * Keep the `\n` v12 appended to the text on the image of the token that matched it, for a
   * stream compared with a lexer of v12's text (not of the source). Default false.
   */
  keepAppendedNewline?: boolean;
  /**
   * Rules to run in place of v12's own for this call, by rule number (the index into the
   * compiled lexer's `rules`), for a gate whose type decided to lex some text differently
   * (requirement's D431 and D432): v12's lexer with that decision applied. Each is called with
   * the input not matched yet and the text matched so far, and returns its match at the start
   * of the input, or null. v12's own rules are back when the call returns.
   */
  rules?: Readonly<Record<number, JisonRule>>;
}

/** A replacement lexer rule (see {@link TokensOptions.rules}). */
export type JisonRule = (input: string, matched: string) => RegExpMatchArray | null;

/** The parts of jison's lexer a replaced rule reads and writes. */
interface RuleTable {
  rules: unknown[];
  matched: string;
}

export interface JisonLexerOracle {
  readonly type: JisonType;
  /**
   * Tokens v12's lexer produced for `source` (front matter, directives and comments removed
   * as v12 did), or undefined when v12 never ran this type's lexer on it. The trailing `$end`
   * is dropped; a grammar's own `EOF` terminal stays. A lexical error ends the list with
   * `[LEXICAL_ERROR, '']`.
   *
   * v12 appended a `\n` to the text before lexing. Unless `keepAppendedNewline` is set, it is
   * taken off the image of the token whose match took the last character of the text, and off
   * none when a rule that returns no token (a skipped blank run) took it, so images are
   * clipped to the source as v13's are.
   */
  tokens(source: string, options?: TokensOptions): Promise<JisonToken[] | undefined>;
  /** The exact text v12's lexer for this type received for `source`, or undefined. */
  lexedText(source: string): Promise<string | undefined>;
  /**
   * The tokens v12's parser itself pulled from its lexer while it parsed `source` (the lexer
   * then read the parser's own `yy`, not the descriptor's builder), in the form `tokens()`
   * returns them, or undefined when v12 never ran this type's parser on it. The parser stops
   * at its first error, so this is a prefix of what the lexer gives on its own; a lexical
   * error ends it with `[LEXICAL_ERROR, '']`. For checking a `yy` builder that plays the
   * parser's part (venn's).
   */
  pulledTokens(source: string): Promise<JisonToken[] | undefined>;
  /**
   * Run `run` (which parses through the v12 oracle, e.g. `oracle.parse`) with `rules` in place
   * of v12's own lexer rules, as {@link TokensOptions.rules} does for one `tokens` call: v12's
   * parser with a decided lexer change applied (requirement's D431 and D432). v12's own rules
   * are back when the returned promise settles.
   */
  withRules<R>(rules: Readonly<Record<number, JisonRule>>, run: () => Promise<R>): Promise<R>;
  readonly LEXICAL_ERROR: typeof LEXICAL_ERROR;
}

interface JisonParser {
  lexer: JisonLexer;
  terminals_: Record<number, string>;
}
interface MermaidV12 {
  mermaidAPI: {
    getDiagramFromText(text: string): Promise<{ parser: { parser: JisonParser }; db: object }>;
  };
}

/**
 * Stop after this many tokens in a row that consume no input: a jison rule that matches the
 * empty string without changing state returns it forever.
 */
const MAX_STALLED = 1000;

const loading = new Map<JisonType, Promise<JisonLexerOracle>>();

/** Load (once per type) and return v12's jison lexer for `type` as an oracle. */
export function loadJisonLexerOracle(type: JisonType): Promise<JisonLexerOracle> {
  let oracle = loading.get(type);
  if (!oracle) {
    oracle = load(type, JISON_TYPES[type]);
    loading.set(type, oracle);
  }
  return oracle;
}

/** A new instance of the DB's class, or the DB itself when it is a plain or module object. */
function defaultYy({ db }: { db: object }): unknown {
  const ctor = (db as { constructor?: unknown }).constructor;
  return typeof ctor === 'function' && ctor !== Object ? new (ctor as new () => object)() : db;
}

async function load(type: JisonType, descriptor: JisonTypeDescriptor): Promise<JisonLexerOracle> {
  const oracle = await loadOracle();
  const mermaid = ((await import('mermaid-v12')) as unknown as { default: MermaidV12 }).default;
  const probe = await mermaid.mermaidAPI.getDiagramFromText(descriptor.probe);
  const { db } = probe;
  const parser = probe.parser.parser;
  const lexer = parser.lexer;
  const yy = descriptor.yy ?? defaultYy;
  const setInput = lexer.setInput.bind(lexer);
  let captured: string | undefined;
  /** The parser's tokens, while `pulledTokens` records them. */
  let pulled: Recording | undefined;
  lexer.setInput = (input, yyArg) => {
    captured = input;
    // A new parse starts over.
    if (pulled) pulled = recording(parser.terminals_);
    setInput(input, yyArg);
  };
  const lexedText = async (source: string): Promise<string | undefined> => {
    captured = undefined;
    await oracle.parse(source);
    // Set by the wrapped setInput during the parse.
    return captured as string | undefined;
  };
  // eslint-disable-next-line @typescript-eslint/unbound-method -- called with jison's lexer as `this`
  const lex = lexer.lex;
  return {
    type,
    LEXICAL_ERROR,
    lexedText,
    async pulledTokens(source) {
      // Only while recording: every other parse runs v12's own `lex`.
      pulled = recording(parser.terminals_);
      lexer.lex = function (this: JisonLexer) {
        return pulled ? pulled.lex(lex, this) : lex.call(this);
      };
      try {
        const input = await lexedText(source);
        return input === undefined ? undefined : pulled.out;
      } finally {
        lexer.lex = lex;
        pulled = undefined;
      }
    },
    async withRules(rules, run) {
      // jison's `parse` lexes with `Object.create(parser.lexer)`: a replaced rule reads what
      // that lexer matched so far, so `lex` notes which lexer is running.
      let current: JisonLexer = lexer;
      const running = (l: JisonLexer) => {
        current = l;
      };
      const restore = replaceRules(lexer, rules, () => current);
      lexer.lex = function (this: JisonLexer) {
        running(this);
        return lex.call(this);
      };
      try {
        return await run();
      } finally {
        lexer.lex = lex;
        restore();
      }
    },
    async tokens(source, options = {}) {
      const input = await lexedText(source);
      if (input === undefined) return undefined;
      const listeners: ((name: string, image: string) => void)[] = [];
      setInput(input, yy({ db, lexer, onToken: (listener) => listeners.push(listener) }));
      const restore = options.rules ? replaceRules(lexer, options.rules) : undefined;
      const out: JisonToken[] = [];
      let clipped = options.keepAppendedNewline === true;
      let left = input.length;
      try {
        for (let stalled = 0; stalled < MAX_STALLED; ) {
          let t: number | string;
          try {
            t = lexer.lex();
          } catch {
            out.push([LEXICAL_ERROR, '']);
            break;
          }
          if (t === 1) break; // $end
          stalled = lexer._input.length < left ? 0 : stalled + 1;
          left = lexer._input.length;
          let image = lexer.yytext;
          // The first token returned once the text is used up: its match took the appended
          // `\n`, unless a skipped rule did (then it does not end in `\n`, or it is empty).
          if (!clipped && lexer._input === '') {
            clipped = true;
            if (image.endsWith('\n')) image = image.slice(0, -1);
          }
          out.push([typeof t === 'number' ? (parser.terminals_[t] ?? String(t)) : t, image]);
          for (const listener of listeners) listener(...(out.at(-1) as JisonToken));
        }
      } finally {
        // A listener may throw: v12's own rules go back on the cached lexer either way.
        restore?.();
      }
      return out;
    },
  };
}

/**
 * Put `rules` in place of the lexer's own; the returned function puts them back. `running` is
 * the lexer whose matched text a rule reads (`lexer` itself unless a parse lexes with a copy).
 */
function replaceRules(
  lexer: JisonLexer,
  rules: Readonly<Record<number, JisonRule>>,
  running: () => JisonLexer = () => lexer
): () => void {
  const table = lexer as unknown as RuleTable;
  const saved = new Map<number, unknown>();
  for (const [key, rule] of Object.entries(rules)) {
    const k = Number(key);
    saved.set(k, table.rules[k]);
    // jison matches with `input.match(rule)`, which calls `Symbol.match`.
    table.rules[k] = {
      [Symbol.match]: (text: string) => rule(text, (running() as unknown as RuleTable).matched),
    };
  }
  return () => {
    for (const [k, rule] of saved) table.rules[k] = rule;
  };
}

interface Recording {
  readonly out: JisonToken[];
  /** v12's `lex` on `self` (the parse's own lexer), recording the token it returns. */
  lex(original: () => number | string, self: JisonLexer): number | string;
}

/**
 * A fresh record of the tokens one parse pulls, decoded and clipped as `tokens()` does. jison's
 * `parse` lexes with `Object.create(parser.lexer)`, and its `lex` calls itself again after a
 * rule that returns no token: only the outer call records.
 */
function recording(terminals: Record<number, string>): Recording {
  const out: JisonToken[] = [];
  let clipped = false;
  let depth = 0;
  return {
    out,
    lex(original, self) {
      if (depth > 0) return original.call(self);
      let t: number | string;
      depth++;
      try {
        t = original.call(self);
      } catch (error) {
        out.push([LEXICAL_ERROR, '']);
        throw error;
      } finally {
        depth--;
      }
      if (t === 1) return t; // $end
      let image = self.yytext;
      if (!clipped && self._input === '') {
        clipped = true;
        if (image.endsWith('\n')) image = image.slice(0, -1);
      }
      out.push([typeof t === 'number' ? (terminals[t] ?? String(t)) : t, image]);
      return t;
    },
  };
}
