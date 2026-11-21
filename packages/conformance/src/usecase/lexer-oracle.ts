/**
 * v12's usecase lexer as an oracle (lexer-parity gate, parser-method §1, D324, D220). Usecase is
 * the one v12 type lexed by Chevrotain outside `@mermaid-js/parser`: its lexer is a
 * module-private singleton in `mermaid@12.2.0`'s usecase chunk, and `runChevrotainParse` keeps it
 * in a local, so neither is reachable. In the core build (`dist/mermaid.core.mjs`, the package's
 * `exports['.']`) `chevrotain` is an external import, so the chunk's `Lexer` is the one `chevrotain`
 * module `mermaid-v12` resolves. This resolves that module from the `mermaid-v12` package
 * (`createRequire`), wraps `Lexer.prototype.tokenize` once, and recognises the usecase lexer by its
 * token named `USECASE`. While the main oracle parses a source, the wrapper captures the lexer and
 * the text it received (every v12 rewrite: CRLF, front matter, directives, comment lines,
 * `encodeEntities`, the appended `\n`); the oracle then tokenizes that text again (the lexer is
 * stateless). `mermaid.esm.mjs` inlines chevrotain, so the wrapper would never see its lexer: the
 * load fails when the probe source does not reach it.
 *
 * Calls must be sequential (await each one before the next): the capture is one variable.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chevrotainLex } from '../langium-lexer.ts';
import type { ChevrotainLexResult } from '../langium-lexer.ts';
import { loadOracle } from '../oracle.ts';

/** A Chevrotain token as the gate compares it: its token type's name and its image. */
export type ChevrotainPair = [name: string, image: string];

export interface UsecaseLex {
  /** The text that was lexed. */
  input: string;
  /** The tokens before the first lexer error, in order (`HWS` is skipped, so it is in none). */
  tokens: ChevrotainPair[];
  /**
   * Offset into {@link input} of the first lexer error (Chevrotain skips characters and goes
   * on; the gate does not follow it, D220). Undefined when the text lexed without error.
   */
  errorAt?: number;
}

export interface UsecaseLexerOracle {
  /** Where the `mermaid-v12` the oracle imported resolves: the core build. */
  entry: string;
  /** The `chevrotain` module file the oracle wrapped. */
  chevrotain: string;
  /**
   * The exact text v12's usecase lexer received for `source`, or undefined when v12 never
   * reached it (another type was detected, or preprocessing threw).
   */
  input(source: string): Promise<string | undefined>;
  /**
   * {@link lexText} of {@link input}, with the `\n` v12 appended taken off the image of the
   * token that matched it, so images are clipped to the source as v13's are. Undefined when
   * {@link input} is.
   */
  lex(source: string): Promise<UsecaseLex | undefined>;
  /** Lex `text` as given with v12's usecase lexer: no v12 preprocessing, nothing clipped. */
  lexText(text: string): UsecaseLex;
}

interface ChevrotainLexer {
  lexerDefinition?: { modes?: { defaultMode?: readonly { name?: string }[] } };
  tokenize: (this: ChevrotainLexer, text: string, mode?: string) => ChevrotainLexResult;
}
interface ChevrotainModule {
  Lexer: { prototype: ChevrotainLexer };
}

/** A source v12 detects as usecase and lexes, used once to check the hook reaches the lexer. */
const PROBE = 'usecase-beta\nactor A';
const WRAPPED = Symbol.for('mermaid-v13.conformance.usecase-lexer');

const isUsecaseLexer = (lexer: ChevrotainLexer): boolean =>
  lexer.lexerDefinition?.modes?.defaultMode?.some((t) => t.name === 'USECASE') === true;

let loading: Promise<UsecaseLexerOracle> | undefined;
/** Set only while a capture parses; the prototype wrapper is installed once per process. */
let hook: ((lexer: ChevrotainLexer, text: string) => void) | undefined;

/** Load (once) and return the usecase lexer oracle. */
export function loadUsecaseLexerOracle(): Promise<UsecaseLexerOracle> {
  loading ??= load();
  return loading;
}

/** The `mermaid-v12` package directory and the file its `import` resolves to. */
function v12Entry(): { dir: string; entry: string } {
  const require = createRequire(import.meta.url);
  const dir = realpathSync(dirname(require.resolve('mermaid-v12/package.json')));
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    exports: { '.': { import: string } };
  };
  return { dir, entry: join(dir, manifest.exports['.'].import) };
}

async function load(): Promise<UsecaseLexerOracle> {
  const { dir, entry } = v12Entry();
  if (!entry.endsWith(join('dist', 'mermaid.core.mjs'))) {
    throw new Error(`mermaid-v12 resolves to ${entry}, not its core build`);
  }
  // The chevrotain the core build's chunks import: resolved from the mermaid-v12 package.
  const chevrotain = realpathSync(createRequire(join(dir, 'package.json')).resolve('chevrotain'));
  const { Lexer } = (await import(pathToFileURL(chevrotain).href)) as ChevrotainModule;

  const proto = Lexer.prototype as ChevrotainLexer & { [WRAPPED]?: true };
  if (!proto[WRAPPED]) {
    const tokenize = proto.tokenize;
    proto.tokenize = function (this: ChevrotainLexer, text: string, mode?: string) {
      if (isUsecaseLexer(this)) hook?.(this, text);
      return tokenize.call(this, text, mode);
    };
    proto[WRAPPED] = true;
  }

  const oracle = await loadOracle();
  /** The usecase lexer and the text it received first while v12 parses `source`. */
  const capture = async (source: string) => {
    let captured: { lexer: ChevrotainLexer; text: string } | undefined;
    hook = (lexer, text) => {
      captured ??= { lexer, text };
    };
    try {
      await oracle.parse(source);
    } finally {
      hook = undefined;
    }
    // Set by the wrapped `tokenize` during the await (TS cannot see that).
    return captured as { lexer: ChevrotainLexer; text: string } | undefined;
  };
  const probe = await capture(PROBE);
  if (!probe) {
    throw new Error('the usecase lexer was not reached: mermaid-v12 must load its core build');
  }
  const lexer = probe.lexer;
  return {
    entry,
    chevrotain,
    async input(source) {
      return (await capture(source))?.text;
    },
    lexText: (text) => chevrotainLex(lexer, text, false),
    async lex(source) {
      const got = await capture(source);
      return got === undefined ? undefined : chevrotainLex(got.lexer, got.text, true);
    },
  };
}
