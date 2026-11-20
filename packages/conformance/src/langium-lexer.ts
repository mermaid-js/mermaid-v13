/**
 * v12's Langium lexers as oracles (lexer-parity gate, parser-method §1, D213, D220). Pie and
 * gitGraph were Langium grammars in v12, lexed by Chevrotain from `@mermaid-js/parser`. This
 * runs that lexer, from the same package version `mermaid@12.2.0` resolves (the
 * `mermaid-parser-v12` alias), on exactly the text v12's parser received for a source.
 *
 * One oracle serves every Langium type: a type is a {@link LangiumLexerDescriptor}, a row of
 * `LANGIUM_LEXERS` that the type's own `src/<type>/tables.ts` exports as `langium` (gitGraph's
 * T1 added its row, D262); nothing else changes.
 *
 * The text is captured by wrapping the `parse` of v12's registered parser for the type while
 * the main oracle parses the source, so every v12 rewrite (CRLF, front matter, directives,
 * comment lines, `encodeEntities`, the appended `\n`) is v12's own. Calls must be sequential
 * (await each one before the next): the captured text is one variable per oracle.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOracle } from './oracle.ts';
import { LANGIUM_LEXERS, rowOf } from './tables.ts';

/** How to reach one type's Langium lexer. */
export interface LangiumLexerDescriptor {
  /** A source v12 detects as the type and parses, used once to reach its parser object. */
  probe: string;
  /** The `@mermaid-js/parser` export that builds the services, e.g. `createPieServices`. */
  factory: string;
  /** The language's key in what the factory returns, e.g. `Pie`. */
  key: string;
  /**
   * Where the text v12 lexed is captured. By default it is what v12's diagram parser for the
   * type received. `'langium'`: what the shared Langium parser's `parse` received during that
   * call, for a type whose diagram parser rewrites its text first (treeView's box-drawing pass).
   */
  capture?: 'langium';
}

export { LANGIUM_LEXERS } from './tables.ts';

/**
 * A Langium type's name: its key in `LANGIUM_LEXERS` (`src/tables.ts`), the union of each
 * type's `src/<type>/tables.ts` `langium` rows.
 */
export type LangiumLexerType = string;

/** A Chevrotain token as the gate compares it: its token type's name and its image. */
export type LangiumToken = [name: string, image: string];

export interface LangiumLex {
  /** The text that was lexed. */
  input: string;
  /** The tokens before the first lexer error, in order. */
  tokens: LangiumToken[];
  /**
   * The hidden-group tokens before the first lexer error, in order (pie: `YAML`, `DIRECTIVE`,
   * `SINGLE_LINE_COMMENT`). Skipped tokens (`WHITESPACE`) are in neither list.
   */
  hidden: LangiumToken[];
  /**
   * Offset into {@link input} of the first lexer error (Chevrotain skips characters and goes
   * on; the gate does not follow it, D220). Undefined when the text lexed without error.
   */
  errorAt?: number;
}

/** What v12 did with one source of the type. */
export interface LangiumTrace {
  /** The text v12's diagram parser for the type received, if it was reached. */
  parsed?: string;
  /** The text v12's Langium lexer read (`parsed`, unless the type rewrites it), if reached. */
  lexed?: string;
  /** v12's error message, when it rejected the source. */
  error?: string;
}

export interface LangiumLexerOracle {
  /** What v12 did with `source`: the texts its parsers received, and its error. */
  trace(source: string): Promise<LangiumTrace>;
  /**
   * The exact text v12's lexer for the type read for `source` ({@link LangiumTrace.lexed}): what
   * its diagram parser received, or with `capture: 'langium'` what the Langium parser received
   * after the diagram parser's own rewrite (treeView's box pass). Undefined when v12 never
   * reached it: another type was detected, preprocessing threw, or (treeView) the box pass threw.
   */
  input(source: string): Promise<string | undefined>;
  /**
   * {@link lexText} of {@link input}, with the `\n` v12 appended taken off the image of the
   * token that matched it, so images are clipped to the source as v13's are. Undefined when
   * {@link input} is.
   */
  lex(source: string): Promise<LangiumLex | undefined>;
  /** Lex `text` as given: no v12 preprocessing, nothing clipped. */
  lexText(text: string): LangiumLex;
}

export interface ChevrotainToken {
  image: string;
  startOffset: number;
  tokenType: { name: string };
}
export interface ChevrotainLexResult {
  tokens: ChevrotainToken[];
  hidden?: ChevrotainToken[];
  errors: { offset: number }[];
}
export interface LangiumLexer {
  tokenize(text: string): ChevrotainLexResult;
}
interface LangiumParserV12 {
  parse: (text: string, ...rest: unknown[]) => unknown;
}
interface ParserDefinitionV12 {
  parse: (text: string) => Promise<void> | void;
}
interface MermaidV12 {
  mermaidAPI: {
    getDiagramFromText(text: string): Promise<{ parser: ParserDefinitionV12 }>;
  };
}

const CONFORMANCE_DIR = fileURLToPath(new URL('..', import.meta.url));
const ALIAS = 'mermaid-parser-v12';
const PARSER = '@mermaid-js/parser';

const readVersion = (dir: string) =>
  (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string }).version;

/**
 * Where each copy of `@mermaid-js/parser` lives, and its version: the `mermaid-parser-v12`
 * alias conformance pins (with its specifier), and the one `mermaid-v12` itself resolves. The
 * version check (D213) asserts they are one package.
 */
export function langiumParserVersions(): {
  alias: { dir: string; version: string; specifier: string };
  v12: { dir: string; version: string };
} {
  const require = createRequire(import.meta.url);
  const mermaidDir = realpathSync(dirname(require.resolve('mermaid-v12/package.json')));
  // pnpm puts a package's dependencies beside it (as `oracle.ts` finds DOMPurify).
  const v12Dir = realpathSync(join(dirname(mermaidDir), PARSER));
  const aliasDir = realpathSync(join(CONFORMANCE_DIR, 'node_modules', ALIAS));
  const manifest = JSON.parse(readFileSync(join(CONFORMANCE_DIR, 'package.json'), 'utf8')) as {
    devDependencies: Record<string, string>;
  };
  return {
    alias: {
      dir: aliasDir,
      version: readVersion(aliasDir),
      specifier: manifest.devDependencies[ALIAS] ?? '',
    },
    v12: { dir: v12Dir, version: readVersion(v12Dir) },
  };
}

const loading = new Map<LangiumLexerType, Promise<LangiumLexerOracle>>();

/** Load (once per type) and return the type's Langium lexer oracle. */
export function loadLangiumLexerOracle(type: LangiumLexerType): Promise<LangiumLexerOracle> {
  let oracle = loading.get(type);
  if (!oracle) {
    oracle = load(rowOf(LANGIUM_LEXERS, type, 'LANGIUM_LEXERS'));
    loading.set(type, oracle);
    // A failed load is not kept: the next call tries again (and `load` undid its patches).
    oracle.catch(() => loading.delete(type));
  }
  return oracle;
}

async function load(descriptor: LangiumLexerDescriptor): Promise<LangiumLexerOracle> {
  const parserModule = (await import('mermaid-parser-v12')) as Record<string, unknown>;
  const factory = parserModule[descriptor.factory];
  if (typeof factory !== 'function') throw new Error(`${PARSER} has no ${descriptor.factory}`);
  const services = (
    factory as () => Record<
      string,
      { parser: { Lexer: LangiumLexer; LangiumParser: LangiumParserV12 } }
    >
  )()[descriptor.key];
  if (!services) throw new Error(`${descriptor.factory}() has no ${descriptor.key} services`);
  const lexer = services.parser.Lexer;

  const oracle = await loadOracle();
  const mermaid = ((await import('mermaid-v12')) as unknown as { default: MermaidV12 }).default;
  // getDiagram(type).parser: the object v12 calls `parse(text)` on for every source of the type.
  const parser = (await mermaid.mermaidAPI.getDiagramFromText(descriptor.probe)).parser;
  const parse = parser.parse.bind(parser);
  let parsed: string | undefined;
  let lexed: string | undefined;
  /** Undoes the patches below, when `load` fails after making them. */
  const undo: (() => void)[] = [];
  const diagramParse = parser.parse;
  undo.push(() => {
    parser.parse = diagramParse;
  });
  if (descriptor.capture === 'langium') {
    // v12 builds the type's Langium parser privately; its class is the one our services use
    // (one `@mermaid-js/parser` realpath, `langiumParserVersions`). Wrap that class's `parse`,
    // armed only while v12's diagram parser for this type runs.
    let owner: object | null = services.parser.LangiumParser;
    while (owner && !Object.prototype.hasOwnProperty.call(owner, 'parse')) {
      owner = Object.getPrototypeOf(owner) as object | null;
    }
    if (!owner) throw new Error(`${descriptor.key}: no LangiumParser parse to wrap`);
    const target = owner as LangiumParserV12;
    const langiumParse = target.parse;
    undo.push(() => {
      target.parse = langiumParse;
    });
    // The oracle is sequential only (await each call before the next, as for every type): the
    // wrapper cannot tell v12's treeView parser instance from another type's, so `armed` is
    // what scopes it to the treeView diagram parser's own call, and only that call's first
    // Langium parse is taken.
    let armed = false;
    target.parse = function (this: unknown, text: string, ...rest: unknown[]) {
      if (armed && lexed === undefined) lexed = text;
      return langiumParse.call(this, text, ...rest);
    };
    parser.parse = async (text) => {
      parsed = text;
      armed = true;
      try {
        await parse(text);
      } finally {
        armed = false;
      }
    };
  } else {
    parser.parse = (text) => {
      parsed = text;
      lexed = text;
      return parse(text);
    };
  }
  const trace = async (source: string): Promise<LangiumTrace> => {
    parsed = undefined;
    lexed = undefined;
    const result = await oracle.parse(source);
    // Set by the wrapped `parse` during the await (TS cannot see that).
    const out: LangiumTrace = {};
    const p = parsed as string | undefined;
    const l = lexed as string | undefined;
    if (p !== undefined) out.parsed = p;
    if (l !== undefined) out.lexed = l;
    if (!result.accepted) out.error = result.error;
    return out;
  };
  const input = async (source: string) => (await trace(source)).lexed;
  try {
    if ((await input(descriptor.probe)) === undefined) {
      throw new Error(`${descriptor.key}: the probe did not reach v12's lexer`);
    }
  } catch (error) {
    for (const u of undo) u();
    throw error;
  }
  return {
    trace,
    input,
    lexText: (text) => chevrotainLex(lexer, text, false),
    async lex(source) {
      const text = await input(source);
      return text === undefined ? undefined : chevrotainLex(lexer, text, true);
    },
  };
}

/**
 * Lex `input` with a Chevrotain lexer: the tokens and hidden tokens before the first error, and
 * with `clip` the `\n` v12 appended taken off the image of the token that ends the input. The
 * usecase lexer oracle uses it too.
 */
export function chevrotainLex(lexer: LangiumLexer, input: string, clip: boolean): LangiumLex {
  const result = lexer.tokenize(input);
  let errorAt: number | undefined;
  for (const e of result.errors)
    if (errorAt === undefined || e.offset < errorAt) errorAt = e.offset;
  const keep = (t: ChevrotainToken) => errorAt === undefined || t.startOffset < errorAt;
  const pair = (t: ChevrotainToken): LangiumToken => {
    const end = t.startOffset + t.image.length;
    const image =
      clip && end === input.length && t.image.endsWith('\n') ? t.image.slice(0, -1) : t.image;
    return [t.tokenType.name, image];
  };
  const out: LangiumLex = {
    input,
    tokens: result.tokens.filter(keep).map(pair),
    hidden: (result.hidden ?? []).filter(keep).map(pair),
  };
  if (errorAt !== undefined) out.errorAt = errorAt;
  return out;
}
