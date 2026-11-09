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
 *   parser, `db` and `renderer`;
 * - `renderer.draw` stands for v12's renderer: it lays out and renders the rules `db` holds with
 *   the v13 layout and renderer (synchronously, as v12's specs call it), in the default theme,
 *   measuring text with the `getBBox` the spec stubs on `SVGElement.prototype`; `document`
 *   answers the spec's DOM reads from the rendered tree (`getElementById`, `querySelector(All)`
 *   with class, tag, descendant and `>` selectors, `getAttribute`). `getAttribute` gives `d`,
 *   `transform` and `style` in v12's spacing (`M 0 40 L 74 18`, `translate(74, 0)`,
 *   `max-width: 200px`): v13's writer spaces them otherwise, with the same numbers (MIGRATION
 *   "Railroad SVG structure");
 * - `createRailroadServices` and `parseAsync` stand for `@mermaid-js/parser`'s IR services and
 *   `parse`: `value` is the model as Langium's AST names it (`RailroadSequenceExpr`, …), and a
 *   failed `parseAsync` rejects with a `MermaidParseError`.
 */
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { treeWriter, type SvgNode, type SvgTree } from '@mermaid-js/core/svg';
import type { Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme } from '@mermaid-js/core/theme';
import { layoutRailroad } from '../layout/index.ts';
import { detectRailroad, parseRailroad } from '../parser/index.ts';
import { railroad as plugin } from '../plugin.ts';
import { renderRailroad } from '../render/index.ts';
import type { RailroadModel, RailroadNode, RailroadNotation, RailroadRule } from '../model.ts';

interface V12Rule {
  name: string;
  definition: unknown;
  comment?: string;
}

/** The model last loaded into `db`, for `renderer.draw`. */
let loaded: RailroadModel | undefined;

/** v12's railroad DB, as its specs drive it. */
function railroadDb() {
  let title = '';
  let accTitle = '';
  let accDescription = '';
  const rules: V12Rule[] = [];
  const byName = new Map<string, V12Rule>();
  const db = {
    clear(): void {
      loaded = undefined;
      title = '';
      accTitle = '';
      accDescription = '';
      rules.length = 0;
      byName.clear();
    },
    load(model: RailroadModel): void {
      db.clear();
      loaded = model;
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
        diagram: { parser: PARSERS[id], db, renderer },
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

/** v12's `getStyles` wrote CSS text; v13 writes none (its spec is skipped). */
export const getStyles = undefined;
export const reset = (): void => {
  drawn = undefined;
};
export const configApi = { setSiteConfig: (): void => undefined };
export const themes = {};

/** `SVGElement`, whose prototype the renderer spec stubs `getBBox` on (its text measurer). */
export const SVGElement = { prototype: {} as { getBBox?: (this: { textContent: string }) => Box } };

interface Box {
  width: number;
  height: number;
}

/** The spec's stubbed `getBBox` as a measurer: v12 measured every text with it. */
const bboxMeasurer: Measurer = {
  id: 'railroad-v12-getBBox',
  width: (text) => bbox(text).width,
  metrics: () => {
    const h = bbox('').height;
    return { ascent: (h * 3) / 4, descent: h / 4, lineHeight: h };
  },
};

function bbox(text: string): Box {
  const stub = SVGElement.prototype.getBBox;
  if (!stub) throw new Error('renderer: the spec stubs SVGElement.prototype.getBBox first');
  return stub.call({ textContent: text });
}

const defaultTheme = await loadTheme('default');

/** The tree the last `draw` rendered, and its root. */
let drawn: { tree: SvgTree; id: string } | undefined;

export const renderer = {
  /** v12 `draw(text, id, version, diagram)`: renders the rules `db` holds. */
  draw(_text: string, id: string, version: string): void {
    const model: RailroadModel = loaded ?? {
      notation: 'railroad',
      rules: db.getRules() as unknown as RailroadRule[],
      accTitle: '',
      accDescr: '',
      warnings: [],
    };
    const ctx = {
      config: { railroad: {} } as unknown as ResolvedConfig,
      theme: createTheme(defaultTheme, { diagram: plugin.theme }),
      measurer: bboxMeasurer,
      idPrefix: id,
      version,
      warn: (): void => undefined,
    };
    const w = treeWriter();
    renderRailroad(model, layoutRailroad(model, ctx), ctx, w);
    w.finish();
    drawn = { tree: w.tree, id };
  },
};

/** v12's spacing of a `d`, `transform` or `style` value (the numbers are v13's). */
function v12Format(name: string, value: string): string {
  if (name === 'd')
    return (value.match(/[MLA][^MLA]*/g) ?? [])
      .map((seg) => [seg[0], ...(seg.slice(1).match(/-?[\d.]+(?:e[-+]?\d+)?/g) ?? [])].join(' '))
      .join(' ');
  if (name === 'transform') return value.replace(/,/g, ', ');
  if (name === 'style')
    return value
      .split(';')
      .map((d) => d.replace(/:/, ': '))
      .join('; ');
  return value;
}

/** An element as the spec reads it. */
interface Element {
  getAttribute(name: string): string | null;
  readonly textContent: string;
}

function element(tree: SvgTree, n: SvgNode): Element {
  const text = (m: SvgNode): string => tree.textOf(m) ?? tree.children(m).map(text).join('');
  return {
    get textContent() {
      return text(n);
    },
    getAttribute: (name) => {
      const v = tree.getAttr(n, name as Parameters<SvgTree['getAttr']>[1]);
      return v === undefined ? null : v12Format(name, v);
    },
  };
}

/** One compound selector (`tag`, `.class`, `tag.class`) against a node. */
function matches(tree: SvgTree, n: SvgNode, compound: string): boolean {
  const m = /^([a-z]*)([.\w-]*)$/i.exec(compound);
  if (!m) throw new Error(`document shim: unsupported selector part ${compound}`);
  if (m[1] && tree.tag(n) !== m[1]) return false;
  const classes = (tree.getAttr(n, 'class') ?? '').split(/\s+/);
  return m[2]!
    .split('.')
    .filter(Boolean)
    .every((c) => classes.includes(c));
}

/** The nodes `selector` (compounds joined by descendant spaces and `>`) picks, in document order. */
function select(tree: SvgTree, selector: string): SvgNode[] {
  const parts = selector
    .trim()
    .split(/\s*(>)\s*|\s+/)
    .filter(Boolean);
  const all = tree.find({}).filter((n) => tree.tag(n) !== undefined);
  const fits = (n: SvgNode, i: number): boolean => {
    if (!matches(tree, n, parts[i]!)) return false;
    if (i === 0) return true;
    if (parts[i - 1] === '>') {
      const p = tree.parent(n);
      return p !== undefined && fits(p, i - 2);
    }
    for (let p = tree.parent(n); p !== undefined; p = tree.parent(p))
      if (fits(p, i - 1)) return true;
    return false;
  };
  return all.filter((n) => fits(n, parts.length - 1));
}

export const document = {
  body: {
    set innerHTML(_html: string) {
      drawn = undefined;
    },
  },
  getElementById(id: string): Element | null {
    if (!drawn || drawn.id !== id) return null;
    const root = drawn.tree.find({ tag: 'svg' })[0];
    return root === undefined ? null : element(drawn.tree, root);
  },
  querySelectorAll(selector: string): Element[] {
    if (!drawn) return [];
    const { tree } = drawn;
    return select(tree, selector).map((n) => element(tree, n));
  },
  querySelector(selector: string): Element | null {
    return document.querySelectorAll(selector)[0] ?? null;
  },
};
