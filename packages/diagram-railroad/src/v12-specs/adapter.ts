// cspell:words nonterminal
/**
 * Test-only adapter for the ported v12 railroad specs (R-TEST-3), backed by the v13 railroad
 * parsers. The specs' expectations are kept as v12 wrote them; this file only translates names
 * and shapes:
 *
 * - `irParser`, `ebnfParser`, `abnfParser` and `pegParser` stand for v12's four parsers
 *   (`parser/*Parser.ts`): `parse` reads the text in that notation (as each v12 parser did,
 *   whatever its header), throws the first error's message (v12 threw a `MermaidParseError`)
 *   and loads the model into `db`;
 * - `db` stands for v12's railroad DB, the one all four share (`railroadDb.ts`): the model's
 *   rules, duplicates included, with `getRule` returning the last rule of a name; its setters
 *   keep what v12 kept, apart from `sanitizeText` (v13 never reads text as HTML: R-SEC-2);
 * - `railroad`, `railroadEbnf`, `railroadAbnf` and `railroadPeg` stand for v12's detector
 *   definitions: `detector` is `detectRailroad` naming that notation, and `loader` gives the
 *   parser and `db` (the renderer lands with T4, #613);
 * - `createRailroadServices` and `parseAsync` stand for `@mermaid-js/parser`'s IR services and
 *   `parse`: `value` is the model as Langium's AST names it (`RailroadSequenceExpr`, …), and a
 *   failed `parseAsync` rejects with a `MermaidParseError`.
 */
import { detectRailroad, parseRailroad } from '../parser/index.ts';
import type { RailroadModel, RailroadNode, RailroadNotation } from '../model.ts';

interface V12Rule {
  name: string;
  definition: unknown;
  comment?: string;
}

/** v12's railroad DB, as its specs drive it. */
function railroadDb() {
  let title = '';
  let accTitle = '';
  let accDescription = '';
  const rules: V12Rule[] = [];
  const byName = new Map<string, V12Rule>();
  const db = {
    clear(): void {
      title = '';
      accTitle = '';
      accDescription = '';
      rules.length = 0;
      byName.clear();
    },
    load(model: RailroadModel): void {
      db.clear();
      if (model.accDescr) db.setAccDescription(model.accDescr);
      if (model.accTitle) db.setAccTitle(model.accTitle);
      if (model.title) db.setTitle(model.title);
      for (const r of model.rules) db.addRule({ name: r.name, definition: r.definition });
    },
    setTitle(text: string): void {
      title = text;
    },
    getTitle: (): string => title,
    addRule(rule: V12Rule): void {
      rules.push(rule);
      byName.set(rule.name, rule);
    },
    getRules: (): V12Rule[] => rules,
    getRule: (name: string): V12Rule | undefined => byName.get(name),
    setAccTitle(text: string): void {
      accTitle = text.replace(/^\s+/g, '');
    },
    getAccTitle: (): string => accTitle,
    setAccDescription(text: string): void {
      accDescription = text.replace(/\n\s+/g, '\n');
    },
    getAccDescription: (): string => accDescription,
    setDiagramTitle(text: string): void {
      title = text;
    },
    getDiagramTitle: (): string => title,
  };
  return db;
}

/** The DB the four parsers share. */
export const db = railroadDb();

/** v12's parser for `notation`. */
function parserFor(notation: RailroadNotation) {
  return {
    parser: { yy: db },
    parse(text: string): void {
      const result = parseRailroad(text, { notation });
      const error = result.diagnostics.find((d) => d.severity === 'error');
      if (error) throw new Error(error.message);
      db.load(result.model);
    },
  };
}

export const irParser = parserFor('railroad');
export const ebnfParser = parserFor('railroadEbnf');
export const abnfParser = parserFor('railroadAbnf');
export const pegParser = parserFor('railroadPeg');

const PARSERS: Readonly<Record<RailroadNotation, ReturnType<typeof parserFor>>> = {
  railroad: irParser,
  railroadEbnf: ebnfParser,
  railroadAbnf: abnfParser,
  railroadPeg: pegParser,
};

/** v12's detector definition of `notation`. */
function definitionOf(id: RailroadNotation) {
  return {
    id,
    detector: (text: string): boolean => detectRailroad(text) === id,
    loader: () =>
      Promise.resolve({
        id,
        diagram: { parser: PARSERS[id], db, renderer: undefined },
      }),
  };
}

export const railroad = definitionOf('railroad');
export const railroadEbnf = definitionOf('railroadEbnf');
export const railroadAbnf = definitionOf('railroadAbnf');
export const railroadPeg = definitionOf('railroadPeg');

/** `@mermaid-js/parser`'s parse error. */
export class MermaidParseError extends Error {}

/** A model node as Langium's IR AST names it. */
function irNode(n: RailroadNode): Record<string, unknown> {
  switch (n.type) {
    case 'terminal':
      return { $type: 'RailroadTerminalExpr', value: n.value };
    case 'nonterminal':
      return { $type: 'RailroadNonTerminalExpr', name: n.name };
    case 'special':
      return { $type: 'RailroadSpecialExpr', text: n.text };
    case 'sequence':
      return { $type: 'RailroadSequenceExpr', elements: n.elements.map(irNode) };
    case 'choice':
      return { $type: 'RailroadChoiceExpr', alternatives: n.alternatives.map(irNode) };
    case 'optional':
      return { $type: 'RailroadOptionalExpr', element: irNode(n.element) };
    case 'repetition':
      return {
        $type: n.min === 0 ? 'RailroadZeroOrMoreExpr' : 'RailroadOneOrMoreExpr',
        element: irNode(n.element),
      };
  }
}

interface LangiumResult {
  value: Record<string, unknown>;
  lexerErrors: string[];
  parserErrors: string[];
}

/** The IR parse as Langium's `LangiumParser.parse` returns it. */
function irParse(text: string): LangiumResult {
  const result = parseRailroad(text, { notation: 'railroad' });
  const errors = result.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message);
  const { model } = result;
  return {
    value: {
      $type: 'Railroad',
      ...(model.title ? { title: model.title } : {}),
      ...(model.accTitle ? { accTitle: model.accTitle } : {}),
      ...(model.accDescr ? { accDescr: model.accDescr } : {}),
      rules: model.rules.map((r) => ({
        $type: 'RailroadRule',
        name: r.name,
        definition: irNode(r.definition),
      })),
    },
    lexerErrors: errors.filter((e) => /^Unexpected character|^Unclosed/.test(e)),
    parserErrors: errors.filter((e) => !/^Unexpected character|^Unclosed/.test(e)),
  };
}

export function createRailroadServices(): {
  Railroad: { parser: { LangiumParser: { parse: typeof irParse } } };
} {
  return { Railroad: { parser: { LangiumParser: { parse: irParse } } } };
}

/** `@mermaid-js/parser`'s `parse(type, text)`, for the IR type. */
export function parseAsync(type: string, text: string): Promise<unknown> {
  if (type !== 'railroad') return Promise.reject(new Error(`no parser for ${type}`));
  const result = irParse(text);
  if (result.lexerErrors.length + result.parserErrors.length > 0) {
    return Promise.reject(new MermaidParseError(result.parserErrors[0] ?? result.lexerErrors[0]));
  }
  return Promise.resolve(result.value);
}

/** v12's `expectNoErrorsOrAlternatives` (`packages/parser/tests/test-util.ts`). */
export function expectNoErrorsOrAlternatives(result: LangiumResult): void {
  if (result.lexerErrors.length > 0 || result.parserErrors.length > 0) {
    throw new Error([...result.lexerErrors, ...result.parserErrors].join('\n'));
  }
}

/** The layout and renderer land with T3 (#612) and T4 (#613); their specs are skipped. */
export const renderer = undefined;
export const getStyles = undefined;
export const reset = (): void => undefined;
export const configApi = { setSiteConfig: (): void => undefined };
export const themes = {};
