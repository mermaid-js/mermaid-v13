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
  lexer.setInput = (input, yyArg) => {
    captured = input;
    setInput(input, yyArg);
  };
  const lexedText = async (source: string): Promise<string | undefined> => {
    captured = undefined;
    await oracle.parse(source);
    // Set by the wrapped setInput during the parse.
    return captured as string | undefined;
  };
  return {
    type,
    LEXICAL_ERROR,
    lexedText,
    async tokens(source, options = {}) {
      const input = await lexedText(source);
      if (input === undefined) return undefined;
      setInput(input, yy({ db, lexer }));
      const out: JisonToken[] = [];
      let clipped = options.keepAppendedNewline === true;
      let left = input.length;
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
        // The first token returned once the text is used up: its match took the appended `\n`,
        // unless a skipped rule did (then it does not end in `\n`, or it is an empty match).
        if (!clipped && lexer._input === '') {
          clipped = true;
          if (image.endsWith('\n')) image = image.slice(0, -1);
        }
        out.push([typeof t === 'number' ? (parser.terminals_[t] ?? String(t)) : t, image]);
      }
      return out;
    },
  };
}
