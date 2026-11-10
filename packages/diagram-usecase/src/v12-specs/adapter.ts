// cspell:words markerless
/**
 * Test-only adapter for the ported v12 usecase specs (R-TEST-3), backed by the v13 usecase
 * parse. The specs' expectations are kept as v12 wrote them; this file only translates names
 * and shapes:
 *
 * - `parser.parse` parses with v13 and loads the model into `db`, v12's DB API (its getters
 *   return `Map`s of v12's shapes, `ARROW_TYPE` numbers, the accessibility getters of
 *   `commonDb`); a rejection empties it, as v12's did. A rejection's message is v12's form,
 *   rebuilt from the first error diagnostic: a model error is v13's message (v12's without its
 *   location, D473) with the location put back (`at line L, column C [s,e)`, offsets in the
 *   source, which these specs pass unprocessed), a conflict with its `previous declaration`;
 *   a syntax error is `Error parsing usecase diagram:` (`Error lexing …` at text no token
 *   matched) with v13's message, `but found: '<the token there>'` and the location;
 * - `db.getData()` is v12's `getData` (`usecaseDb.ts`), the projection of the DB onto v12's
 *   renderer contract, here over the v13 model, with `sanitizeText` as identity (sanitising is
 *   the security suites' concern, as in the oracle);
 * - `Diagram.fromText` is `parser.parse`; `addDiagrams` does nothing; `getConfig`/`setConfig`
 *   hold the `usecase` section `getData` reads;
 * - `usecaseLexer.tokenize` lexes text as given (v12's raw lexer: no preprocessing; v13's lexer
 *   with nothing cut out) into Chevrotain-shaped tokens; `usecaseParser` parses the tokens'
 *   text with v13 and reports its syntax errors;
 * - `parseOrderedJsonObject` and `UsecaseJsonError` are v12's JSON reader over v13's
 *   (`json.ts`), with v12's line and column arithmetic.
 *
 * Not here (the specs that need them are skipped, with the reason, in `scripts/v12-skips.json`):
 * `db.getAST()` (D476), v12's `createModel`/`commit` and `getStyles`.
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import type { Diagnostic, Range, SourceView } from '@mermaid-js/core/parser-kit';
import { MODEL_CODES, USECASE_INVALID_JSON } from '../codes.ts';
import type { UsecaseArrowType, UsecaseModel } from '../model.ts';
import { lex, parseOrderedJson, parseUsecase } from '../parser/index.ts';
import type { UsecaseParseResult } from '../parser/index.ts';
import { CHEVROTAIN_NAMES } from '../parser/tokens.ts';
import { DEFAULT_USECASE, layoutData } from './layout-data.ts';

/** v12's `ARROW_TYPE`. */
export const ARROW_TYPE = {
  SOLID_ARROW: 0,
  BACK_ARROW: 1,
  LINE_SOLID: 2,
  CIRCLE_ARROW: 3,
  CROSS_ARROW: 4,
  CIRCLE_ARROW_REVERSED: 5,
  CROSS_ARROW_REVERSED: 6,
} as const;

const ARROW: Readonly<Record<UsecaseArrowType, number>> = {
  point: 0,
  reversedPoint: 1,
  line: 2,
  circle: 3,
  cross: 4,
  reversedCircle: 5,
  reversedCross: 6,
};

type Config = Record<string, unknown> & { usecase?: Record<string, unknown> };
let config: Config = {};
export const getConfig = (): Config => ({ ...config });
export const setConfig = (next: Config): void => {
  config = { ...config, ...next };
};
/** v12's `sanitizeText`; identity here (see above). */
export const sanitizeText = (text: string, _config?: unknown): string => text;
export const addDiagrams = (): void => undefined;

/** An empty model, as v12's cleared DB. */
const EMPTY: UsecaseModel = {
  actors: [],
  useCases: [],
  boundaries: [],
  relationships: [],
  notes: [],
  jsonTables: [],
  classDefs: [],
  direction: 'LR',
  accTitle: '',
  accDescr: '',
  warnings: [],
};

/** v12's DB state: the last accepted model, and its getters' maps in v12's shapes. */
function view(model: UsecaseModel) {
  const shape = (value: object, drop: readonly string[] = []): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k !== 'astId' && !drop.includes(k) && v !== undefined)
        out[k] = JSON.parse(JSON.stringify(v)) as unknown;
    }
    return out;
  };
  const byId = (list: readonly ({ id: string } & object)[], drop?: readonly string[]) =>
    new Map(list.map((e) => [e.id, shape(e, drop)]));
  return {
    model,
    actors: byId(model.actors),
    useCases: byId(model.useCases),
    systemBoundaries: byId(model.boundaries),
    relationships: model.relationships.map((r) => ({ ...shape(r), arrowType: ARROW[r.arrowType] })),
    notes: byId(model.notes),
    jsonNodes: byId(model.jsonTables, ['rows']),
    classDefs: new Map(model.classDefs.map((c) => [c.id, { id: c.id, styles: [...c.styles] }])),
    accTitle: model.accTitle,
    accDescr: model.accDescr,
    title: '',
  };
}
let state = view(EMPTY);

/** `line L, column C [s,e)` of v12's `locationText`, over the source. */
function located(src: string, range: Range): string {
  const before = src.slice(0, range.start);
  const lineStart = Math.max(before.lastIndexOf('\n'), before.lastIndexOf('\r'));
  const line = before.split(/\r\n|\r|\n/).length;
  return `line ${line}, column ${range.start - lineStart} [${range.start},${range.end})`;
}

/** v12's thrown message for v13's first error. */
function v12Message(src: string, d: Diagnostic, tokens: UsecaseParseResult['tokens']): string {
  if (d.code === USECASE_INVALID_JSON) return `Invalid JSON: ${d.message}`;
  if (MODEL_CODES.has(d.code)) {
    const label = / \(label "[^"]*"\)$/.exec(d.message)?.[0] ?? '';
    const head = label ? d.message.slice(0, -label.length) : d.message;
    const previous = d.related?.[0];
    const tail = previous
      ? `; previous declaration at ${located(src, previous.range)}${previous.message.slice('previous declaration'.length)}`
      : '';
    return `${head} at ${located(src, d.range)}${label}${tail}`;
  }
  let token: Range = { start: d.range.start, end: d.range.start };
  let lexer = false;
  for (let j = 0; tokens && j < tokens.length; j++) {
    if (tokens.start[j] !== d.range.start) continue;
    token = { start: d.range.start, end: tokens.end[j] ?? d.range.start };
    lexer = tokens.kind[j] === Kind.Error;
    break;
  }
  const kind = lexer ? 'lexing' : 'parsing';
  const image = src.slice(token.start, token.end);
  return `Error ${kind} usecase diagram: ${d.message} but found: '${image}' at ${located(src, token)}`;
}

export const parser = {
  /** v12's Jison-style hook, unused. */
  parser: { yy: undefined as unknown },
  parse(text: string): Promise<void> {
    state = view(EMPTY);
    const result = parseUsecase(text, { keepTokens: true });
    const error = result.diagnostics.find((d) => d.severity === 'error');
    if (error) return Promise.reject(new Error(v12Message(text, error, result.tokens)));
    state = view(result.model);
    return Promise.resolve();
  },
};

export const getAccTitle = (): string => state.accTitle;
export const getAccDescription = (): string => state.accDescr;

type V12Map = ReadonlyMap<string, Record<string, unknown>>;
type V12Entry = Record<string, unknown> | undefined;

export const db = {
  clear(): void {
    state = view(EMPTY);
  },
  getActors: (): V12Map => state.actors,
  getActor: (id: string): V12Entry => state.actors.get(id),
  getUseCases: (): V12Map => state.useCases,
  getUseCase: (id: string): V12Entry => state.useCases.get(id),
  getSystemBoundaries: (): V12Map => state.systemBoundaries,
  getSystemBoundary: (id: string): V12Entry => state.systemBoundaries.get(id),
  getRelationships: (): readonly Record<string, unknown>[] => state.relationships,
  getNotes: (): V12Map => state.notes,
  getNote: (id: string): V12Entry => state.notes.get(id),
  getJsonNodes: (): V12Map => state.jsonNodes,
  getJsonNode: (id: string): V12Entry => state.jsonNodes.get(id),
  getClassDefs: (): ReadonlyMap<string, { id: string; styles: string[] }> => state.classDefs,
  getClassDef: (id: string): { id: string; styles: string[] } | undefined =>
    state.classDefs.get(id),
  getDirection: (): string => state.model.direction,
  getAccTitle,
  getAccDescription,
  setAccTitle(text: string): void {
    state.accTitle = text;
  },
  setAccDescription(text: string): void {
    state.accDescr = text;
  },
  getDiagramTitle: (): string => state.title,
  setDiagramTitle(text: string): void {
    state.title = text;
  },
  getConfig: (): Record<string, unknown> => ({ ...DEFAULT_USECASE, ...config.usecase }),
  /** D476: v12's `GraphAST` is not ported; v13 has its own AST. */
  getAST: (): undefined => undefined,
  getData: (): Record<string, unknown> => layoutData(state.model, config),
};

export const Diagram = {
  async fromText(text: string): Promise<{ type: string; db: typeof db }> {
    await parser.parse(text);
    return { type: 'usecase', db };
  },
};

/** A Chevrotain token as the specs read it. */
interface ChevrotainToken {
  tokenType: { name: string };
  image: string;
  startOffset: number;
  endOffset: number;
  startLine: number;
  startColumn: number;
  endLine: number;
}

const SOURCE = Symbol('source');

/** 1-based line and column of `offset`, counting `\r\n`, `\r` and `\n` as one break each. */
function position(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < offset; i++) {
    const c = text[i];
    if (c === '\r' && text[i + 1] === '\n') continue;
    if (c === '\n' || c === '\r') {
      line++;
      column = 1;
    } else column++;
  }
  return { line, column };
}

/**
 * v12's raw `usecaseLexer`: text lexed as given, nothing removed. v13's lexer reads the text
 * v12's pipeline built (its start trimmed, a line break appended), so the text goes after a
 * `)` line, whose two tokens are dropped, and the appended line break is dropped too.
 */
const PREFIX = ')\n';
export const usecaseLexer = {
  tokenize(text: string): {
    tokens: ChevrotainToken[] & { [SOURCE]?: string };
    errors: { offset: number }[];
    groups: Record<string, never>;
  } {
    const src = PREFIX + text;
    const raw = { mask: undefined, holes: [], text: src, runs: undefined, braceNewline: false };
    const { tokens, input, at } = lex(src, 0, raw as unknown as SourceView);
    const last = input.text.length - 1;
    const out: ChevrotainToken[] & { [SOURCE]?: string } = [];
    const errors: { offset: number }[] = [];
    for (let j = 0; j < tokens.length; j++) {
      const kind = tokens.kind[j] ?? Kind.EOF;
      const a = at[j] ?? -1;
      if (kind === Kind.EOF || a < PREFIX.length || (kind === Kind.Newline && a === last)) continue;
      const start = (tokens.start[j] ?? 0) - PREFIX.length;
      const end = Math.max(start, Math.min((tokens.end[j] ?? 0) - PREFIX.length, text.length));
      if (kind === Kind.Error) {
        errors.push({ offset: start });
        continue;
      }
      const from = position(text, start);
      out.push({
        tokenType: { name: CHEVROTAIN_NAMES[kind] ?? String(kind) },
        image: text.slice(start, end),
        startOffset: start,
        endOffset: end - 1,
        startLine: from.line,
        startColumn: from.column,
        endLine: position(text, Math.max(start, end - 1)).line,
      });
    }
    out[SOURCE] = text;
    return { tokens: out, errors, groups: {} };
  },
};

/** v12's `usecaseParser` as its grammar spec drives it: the tokens' text, parsed by v13. */
export const usecaseParser = {
  input: [] as ChevrotainToken[] & { [SOURCE]?: string },
  errors: [] as { message: string }[],
  start(): { name: string } {
    const result = parseUsecase(this.input[SOURCE] ?? '');
    this.errors = result.diagnostics
      .filter((d) => d.severity === 'error' && !MODEL_CODES.has(d.code))
      .map((d) => ({ message: d.message }));
    return { name: 'start' };
  },
};

/** v12's `UsecaseJsonError`: a message and the line and column it starts at. */
export class UsecaseJsonError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly column: number
  ) {
    super(`${message} (line ${line}, column ${column})`);
    this.name = 'UsecaseJsonError';
  }
}

/** v12's `locationAtOffset`: from the object's start at `line`, `column`. */
function locationAt(text: string, offset: number, line: number, column: number) {
  let l = line;
  let c = column;
  for (let i = 0; i < Math.min(Math.max(offset, 0), text.length); i++) {
    const ch = text[i];
    if (ch === '\r') {
      l++;
      c = 1;
    } else if (ch === '\n') {
      if (i === 0 || text[i - 1] !== '\r') {
        l++;
        c = 1;
      }
    } else c++;
  }
  return { line: l, column: c };
}

/** v12's `parseOrderedJsonObject`, over v13's reader. */
export function parseOrderedJsonObject(
  text: string,
  line: number,
  column: number
): ReturnType<typeof parseOrderedJson> {
  const parsed = parseOrderedJson(text);
  if ('offset' in parsed) {
    const where = locationAt(text, parsed.offset, line, column);
    throw new UsecaseJsonError(
      `Invalid JSON: expected ${parsed.expected}`,
      where.line,
      where.column
    );
  }
  const root: unknown = parsed.value;
  if (typeof root !== 'object' || root === null || Array.isArray(root)) {
    throw new UsecaseJsonError('JSON value must have an object root', line, column);
  }
  return parsed;
}
