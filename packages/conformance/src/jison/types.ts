// cspell:words unput
/**
 * The descriptor shape for the shared jison lexer oracle and the harvest CLI (D212), and the
 * helpers its rows use. One row per diagram type that v12 parses with jison, in that type's own
 * `src/<type>/tables.ts` (`jison`), gathered into `JISON_TYPES` by `src/tables.ts`. Pie and
 * gitGraph are Langium in v12 and gate on its tokens instead (D213). This module imports
 * nothing, so a type's `tables.ts` can use its helpers.
 */

/** The part of a v12 jison lexer the oracle drives. */
export interface JisonLexer {
  setInput(input: string, yy: unknown): void;
  lex(): number | string;
  yytext: string;
  /** The text not matched yet (kept right by `unput`). */
  _input: string;
}

/** How `harvest <type>` collects v12's spec strings (`src/jison/harvest.ts`). */
export type HarvestMethod =
  /**
   * Every string literal in the type's `*.spec.*` files whose raw text matches `header`, with
   * its JS escapes decoded. Literals with an interpolation are skipped.
   */
  | { kind: 'literals'; header: RegExp }
  /**
   * Like `literals`, but a `a + b + …` chain of literals is one source, a template whose only
   * interpolation is `${keyword}` is one source per entry of the spec's `const keywords`, and
   * `header` is matched against the decoded source.
   */
  | { kind: 'chains'; header: RegExp }
  /**
   * Runs each of `specs` (relative to `dir`; TypeScript has its types stripped) with its
   * imports stubbed and records every argument passed to `<name>.parser.parse` or
   * `<name>.parse`, for each name in `parsers` (the names the specs give v12's jison parser).
   * For specs that build sources in loops, `+` chains or `[…].join('\n')`, which no regex reads.
   */
  | {
      kind: 'run';
      parsers: readonly string[];
      specs: readonly string[];
      /**
       * Imported helpers the specs pass each source through before `parse`: v12's own
       * preprocessing, which the oracle runs again on the recorded source. They are stubbed
       * as the identity, so the recorded source is the text as the spec wrote it.
       */
      identity?: readonly string[];
      /**
       * The specs read files next to them (`fs.readFileSync(path.resolve(__dirname, f))`):
       * `fs`, `path` and `__dirname` read them from git at the v12 commit.
       */
      readsFiles?: boolean;
      /**
       * The DB class the specs construct (`new <name>()`) and build sources from its constant
       * tables (`${db.RiskLevel.HIGH_RISK}`): its object-literal fields are read from v12's
       * `file` (relative to `dir`, at the v12 commit) and hold their real values; every other
       * member stays inert.
       */
      constants?: { name: string; file: string };
    };

/** What a descriptor's `yy` builder is handed for one run of the lexer. */
export interface JisonYyContext {
  /** The probe's DB. */
  db: object;
  lexer: JisonLexer;
  /**
   * Call `listener` with each token of this run (its terminal name and image, as `tokens()`
   * returns them) before the lexer is asked for the next one. For a lexer that reads state its
   * parser's actions write (venn's indent mode), so the builder can play the parser's part.
   */
  onToken: (listener: (name: string, image: string) => void) => void;
}

export interface JisonTypeDescriptor {
  /** A diagram v12 parses with this type's jison parser; loading it hands the oracle that parser. */
  probe: string;
  /**
   * The `yy` for one run of the lexer, built fresh per call. `db` is the probe's DB. Default:
   * a new instance of the DB's class, or the DB itself when it is a plain module object (its
   * lexer actions do not call into it).
   */
  yy?: (context: JisonYyContext) => unknown;
  /** The type's fixture directories under `e2e/diagrams`. */
  e2e: readonly string[];
  /**
   * `false` for the M3 types, whose e2e fixtures are not run through the shared oracle's smoke
   * spec (`jison/smoke.spec.ts`, D212): they gate on their own v13 lexer parity. Every other
   * jison type is smoke-tested.
   */
  smoke?: false;
  /**
   * Fixture ids (`<dir>/…/<name>.mmd`) of `e2e` that v12 rejects before its lexer runs, kept
   * as rejection fixtures: the smoke spec checks each stays unlexed, so the list cannot go stale.
   */
  notLexed?: readonly string[];
  /**
   * Fixture ids of `e2e` that v12's lexer stops on with an error where v13 accepts the text on
   * purpose, each with the issue or decision that says so (and a listed divergence): the smoke
   * spec checks each still fails in v12, so the list cannot go stale.
   */
  lexErrors?: Readonly<Record<string, string>>;
  harvest: {
    /** v12's source directory for the type, relative to the repo root. */
    dir: string;
    /** v12's syntax page for the type, under `packages/mermaid/src/docs/syntax`. */
    docs: string;
    method: HarvestMethod;
  };
}

/** v12's diagram sources, relative to the repo root: where a type's `harvest.dir` points. */
export const V12_DIAGRAMS = 'packages/mermaid/src/diagrams';

/** The literal's raw text starts (after blanks and an escaped line break) with `keyword`. */
export const startsWith = (keyword: string): RegExp =>
  new RegExp(String.raw`^\s*(?:\\n)?\s*(?:${keyword})`);

/**
 * A jison type's name: its key in `JISON_TYPES` (`src/tables.ts`), the union of each type's
 * `src/<type>/tables.ts` `jison` rows. An unknown name is an error where it is looked up.
 */
export type JisonType = string;
