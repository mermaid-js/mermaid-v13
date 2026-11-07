/**
 * v12's Langium lexers as oracles (lexer-parity gate, parser-method §1, D213, D220). Pie and
 * gitGraph were Langium grammars in v12, lexed by Chevrotain from `@mermaid-js/parser`. This
 * runs that lexer, from the same package version `mermaid@12.2.0` resolves (the
 * `mermaid-parser-v12` alias), on exactly the text v12's parser received for a source.
 *
 * One oracle serves every Langium type: a type is a {@link LangiumLexerDescriptor} in
 * {@link LANGIUM_LEXERS}. gitGraph's T1 adds its row there (D262); nothing else changes.
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

/** How to reach one type's Langium lexer. */
export interface LangiumLexerDescriptor {
  /** A source v12 detects as the type and parses, used once to reach its parser object. */
  probe: string;
  /** The `@mermaid-js/parser` export that builds the services, e.g. `createPieServices`. */
  factory: string;
  /** The language's key in what the factory returns, e.g. `Pie`. */
  key: string;
}

/** The Langium types, by v13 diagram id. */
export const LANGIUM_LEXERS = {
  radar: { probe: 'radar-beta\naxis A', factory: 'createRadarServices', key: 'Radar' },
  pie: { probe: 'pie\n"a": 1', factory: 'createPieServices', key: 'Pie' },
  info: { probe: 'info', factory: 'createInfoServices', key: 'Info' },
  gitGraph: { probe: 'gitGraph\n  commit', factory: 'createGitGraphServices', key: 'GitGraph' },
} as const satisfies Record<string, LangiumLexerDescriptor>;

export type LangiumLexerType = keyof typeof LANGIUM_LEXERS;

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

export interface LangiumLexerOracle {
  /**
   * The exact text v12's parser for the type received for `source`, or undefined when v12
   * never reached that parser (another type was detected, or preprocessing threw).
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

interface ChevrotainToken {
  image: string;
  startOffset: number;
  tokenType: { name: string };
}
interface ChevrotainLexResult {
  tokens: ChevrotainToken[];
  hidden?: ChevrotainToken[];
  errors: { offset: number }[];
}
interface LangiumLexer {
  tokenize(text: string): ChevrotainLexResult;
}
interface ParserDefinitionV12 {
  parse(text: string): Promise<void> | void;
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
    oracle = load(LANGIUM_LEXERS[type]);
    loading.set(type, oracle);
  }
  return oracle;
}

async function load(descriptor: LangiumLexerDescriptor): Promise<LangiumLexerOracle> {
  const parserModule = (await import('mermaid-parser-v12')) as Record<string, unknown>;
  const factory = parserModule[descriptor.factory];
  if (typeof factory !== 'function') throw new Error(`${PARSER} has no ${descriptor.factory}`);
  const services = (factory as () => Record<string, { parser: { Lexer: LangiumLexer } }>)()[
    descriptor.key
  ];
  if (!services) throw new Error(`${descriptor.factory}() has no ${descriptor.key} services`);
  const lexer = services.parser.Lexer;

  const oracle = await loadOracle();
  const mermaid = ((await import('mermaid-v12')) as unknown as { default: MermaidV12 }).default;
  // getDiagram(type).parser: the object v12 calls `parse(text)` on for every source of the type.
  const parser = (await mermaid.mermaidAPI.getDiagramFromText(descriptor.probe)).parser;
  const parse = parser.parse.bind(parser);
  let captured: string | undefined;
  parser.parse = (text) => {
    captured = text;
    return parse(text);
  };
  const input = async (source: string): Promise<string | undefined> => {
    captured = undefined;
    await oracle.parse(source);
    // Set by the wrapped `parse` during the await (TS cannot see that).
    return captured as string | undefined;
  };
  return {
    input,
    lexText: (text) => lexWith(lexer, text, false),
    async lex(source) {
      const text = await input(source);
      return text === undefined ? undefined : lexWith(lexer, text, true);
    },
  };
}

function lexWith(lexer: LangiumLexer, input: string, clip: boolean): LangiumLex {
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
