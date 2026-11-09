/**
 * Test-only adapter for the ported v12 treeView specs (R-TEST-3), backed by the v13 treeView
 * parse. The specs' expectations are kept as v12 wrote them; this file only translates names
 * and shapes:
 *
 * - `parser.parse(text)` and `db` stand for v12's diagram parser and its DB: the parse is
 *   v13's (it throws the first error diagnostic, as v12 threw), and `db.getRoot()` is the
 *   model's tree in v12's `Node` shape under its virtual root `/` (`id` is the node's place in
 *   source order, which is how v12 counted). `db.addNode` collects nodes for the model's tree
 *   building; `setAccTitle` and the others parse their text as the statement would;
 * - `preprocessBoxDrawing(input)` stands for v12's box pass: v13's (`box.ts`), its rewrite
 *   without the line break v12 appended, its error thrown, and v12's line map read off where
 *   each rewritten line came from; `isBoxDrawingFormat(lines)` is whether that pass finds box
 *   drawing in the lines after a header;
 * - `detectIcon` and `getNodeIcon` stand for v12's `icons.ts`: v13's `icons.ts`, a node's
 *   `nodeType` read as its `directory` flag;
 * - `createTreeViewServices().TreeView.parser.LangiumParser.parse(text)` stands for
 *   `@mermaid-js/parser`'s Langium parser: `value` is the AST as Langium built it (`nodes` in
 *   source order, each with the values v12's value converter gave, the last of each text
 *   statement), and the errors are v13's syntax errors;
 * - `TreeViewValueConverter` stands for v12's value converter: v13's conversions by rule name.
 */
import {
  BUILTIN_ICON_PACK,
  BUILTIN_ICONS,
  detectIcon as v13DetectIcon,
  resolveIcon,
} from '../icons.ts';
import { CR, LF } from '@mermaid-js/core/parser-kit';
import type { TreeViewIconOptions } from '../icons.ts';
import type { TreeViewModel, TreeViewNode } from '../model.ts';
import type { TreeViewNodeNode } from '../parser/ast.ts';
import { boxDrawing } from '../parser/box.ts';
import {
  bareValue,
  classValue,
  descValue,
  iconValue,
  indentValue,
  quotedValue,
} from '../parser/convert.ts';
import { buildTree } from '../parser/normalise.ts';
import { parseTreeView } from '../parser/parser.ts';

const RANGE = { start: 0, end: 0 };

/** v12's `Node`. */
interface V12Node {
  id: number;
  level: number;
  name: string;
  nodeType: 'file' | 'directory';
  icon?: string;
  cssClass?: string;
  description?: string;
  children: V12Node[];
}

/** The model's nodes in v12's shape, under v12's virtual root. */
function v12Root(roots: readonly TreeViewNode[], nodes: readonly TreeViewNode[]): V12Node {
  const ids = new Map(nodes.map((n, k) => [n, k + 1]));
  const v12 = (n: TreeViewNode): V12Node => ({
    id: ids.get(n) ?? 0,
    level: n.level,
    name: n.name,
    nodeType: n.directory ? 'directory' : 'file',
    icon: n.icon,
    cssClass: n.cssClass,
    description: n.description,
    children: n.children.map(v12),
  });
  return { id: 0, level: -1, name: '/', nodeType: 'directory', children: roots.map(v12) };
}

/** The first error of a parse, thrown as v12 threw. */
function parsedModel(text: string): TreeViewModel {
  const { model, diagnostics } = parseTreeView(text);
  const error = diagnostics.find((d) => d.severity === 'error');
  if (error) throw new Error(error.message);
  return model;
}

/** What one v12 DB instance holds: nodes added by hand, or the last parse, and its texts. */
interface DbState {
  added: TreeViewNodeNode[];
  parsed: TreeViewModel | undefined;
  texts: { title: string; accTitle: string; accDescr: string };
}

const emptyState = (): DbState => ({
  added: [],
  parsed: undefined,
  texts: { title: '', accTitle: '', accDescr: '' },
});

/** v12's treeView DB and the diagram parser that fills it, over the v13 model (one instance). */
function v12Diagram() {
  let state = emptyState();
  const db = {
    clear(): void {
      state = emptyState();
    },
    addNode(
      level: number,
      name: string,
      nodeType: 'file' | 'directory',
      cssClass?: string,
      icon?: string,
      description?: string
    ): void {
      const node: TreeViewNodeNode = {
        id: '',
        type: 'Node',
        range: RANGE,
        name,
        nameRange: RANGE,
        directory: nodeType === 'directory',
        level,
        depth: 0,
      };
      if (cssClass !== undefined) node.cssClass = cssClass;
      if (icon !== undefined) node.icon = icon;
      if (description !== undefined) node.description = description;
      state.added.push(node);
    },
    getRoot(): V12Node {
      const { roots, nodes } = state.parsed ?? buildTree(state.added);
      return v12Root(roots, nodes);
    },
    getCount(): number {
      return (state.parsed ? state.parsed.nodes.length : state.added.length) + 1;
    },
    setAccTitle(t: string): void {
      state.texts.accTitle = parsedModel(`treeView-beta\naccTitle: ${t}`).accTitle;
    },
    getAccTitle: (): string => state.parsed?.accTitle ?? state.texts.accTitle,
    setAccDescription(t: string): void {
      state.texts.accDescr = parsedModel(`treeView-beta\naccDescr: ${t}`).accDescr;
    },
    getAccDescription: (): string => state.parsed?.accDescr ?? state.texts.accDescr,
    setDiagramTitle(t: string): void {
      state.texts.title = parsedModel(`treeView-beta\ntitle ${t}`).title ?? '';
    },
    getDiagramTitle: (): string => state.parsed?.title ?? state.texts.title,
    getConfig(): never {
      throw new Error('the options are ported with the config work (T5, #577)');
    },
  };
  /** v12's diagram parser: parse into `db`. */
  const parser = {
    parse(input: string): Promise<void> {
      state.parsed = parsedModel(input);
      return Promise.resolve();
    },
  };
  return { db, parser };
}

/** The instance the ported specs share, as v12's specs shared its DB module. */
export const { db, parser } = v12Diagram();

// ---- the box pass ------------------------------------------------------------------------

/** The 1-based line of `text` that offset `at` is on (LF, CR and CRLF break lines). */
function lineAt(text: string, at: number): number {
  let line = 1;
  for (let i = 0; i < at; i++) {
    const c = text.charCodeAt(i);
    if (c === LF || (c === CR && text.charCodeAt(i + 1) !== LF)) line++;
  }
  return line;
}

export function preprocessBoxDrawing(input: string): {
  text: string;
  lineMap: Map<number, number>;
} {
  const lineMap = new Map<number, number>();
  const box = boxDrawing(input, 0);
  if (box.kind === 'error') throw new Error(box.errors[0].message);
  if (box.kind === 'none') return { text: input, lineMap };
  const { text, first } = box.rewrite;
  const out = text.slice(0, -1);
  let start = 0;
  for (let line = 1; start <= out.length; line++) {
    const from = first[start];
    if (from !== undefined) lineMap.set(line, lineAt(input, from));
    const next = out.indexOf('\n', start);
    if (next < 0) break;
    start = next + 1;
  }
  return { text: out, lineMap };
}

export function isBoxDrawingFormat(lines: string[]): boolean {
  return boxDrawing(['treeView-beta', ...lines].join('\n'), 0).kind !== 'none';
}

export function remapErrorLines(): never {
  throw new Error('v13 rewrites no message');
}

// ---- icons -------------------------------------------------------------------------------

/** v12's built-in pack: its name and its icon names (D485: v13 draws them itself). */
export const treeViewIcons = {
  prefix: BUILTIN_ICON_PACK,
  icons: Object.fromEntries(BUILTIN_ICONS.map((name) => [name, { body: '' }])),
};

export function detectIcon(name: string, config?: TreeViewIconOptions): string | undefined {
  return v13DetectIcon(name, config);
}

export function getNodeIcon(
  node: { icon?: string; name: string; nodeType: 'file' | 'directory' },
  config: TreeViewIconOptions
): string | undefined {
  const { name, icon } = node;
  return resolveIcon(
    { name, directory: node.nodeType === 'directory', ...(icon === undefined ? {} : { icon }) },
    config
  );
}

// ---- Langium -----------------------------------------------------------------------------

interface LangiumNode {
  $type: 'TreeNode';
  name: string;
  indent?: number;
  classAnnotation?: string;
  iconAnnotation?: string;
  descAnnotation?: string;
}

interface LangiumResult {
  value: {
    $type: 'TreeView';
    nodes: LangiumNode[];
    title?: string;
    accTitle?: string;
    accDescr?: string;
  };
  lexerErrors: string[];
  parserErrors: string[];
}

function langiumParse(input: string): LangiumResult {
  const { ast, diagnostics } = parseTreeView(input);
  const value: LangiumResult['value'] = { $type: 'TreeView', nodes: [] };
  for (const n of ast.children) {
    if (n.type === 'Node') {
      // Langium's name is the converted token, before `populate` took the `/` off.
      const node: LangiumNode = { $type: 'TreeNode', name: n.directory ? `${n.name}/` : n.name };
      if (n.level > 0) node.indent = n.level;
      if (n.cssClass !== undefined) node.classAnnotation = n.cssClass;
      if (n.icon !== undefined) node.iconAnnotation = n.icon;
      if (n.description !== undefined) node.descAnnotation = n.description;
      value.nodes.push(node);
    } else if (n.type === 'Title') value.title = n.text;
    else if (n.type === 'AccTitle') value.accTitle = n.text;
    else if (n.type === 'AccDescr') value.accDescr = n.text;
  }
  const errors = diagnostics.filter((d) => d.severity === 'error').map((d) => d.message);
  return { value, lexerErrors: [], parserErrors: errors };
}

/** `createTreeViewServices().TreeView.parser.LangiumParser`, as the parser spec reads it. */
export function createTreeViewServices(): {
  TreeView: { parser: { LangiumParser: { parse: (input: string) => LangiumResult } } };
} {
  return { TreeView: { parser: { LangiumParser: { parse: langiumParse } } } };
}

export function expectNoErrorsOrAlternatives(result: LangiumResult): void {
  if (result.lexerErrors.length > 0 || result.parserErrors.length > 0) {
    throw new Error([...result.lexerErrors, ...result.parserErrors].join('\n'));
  }
}

/** v12's value converter, by rule name. */
const CONVERTERS: Readonly<Record<string, (input: string) => string | number>> = {
  INDENTATION: indentValue,
  QUOTED_NAME: quotedValue,
  BARE_NAME: bareValue,
  CLASS_ANNOTATION: classValue,
  ICON_ANNOTATION: iconValue,
  DESC_ANNOTATION: descValue,
};

export class TreeViewValueConverter {
  protected runCustomConverter(rule: { name: string }, input: string): string | number | undefined {
    return Object.hasOwn(CONVERTERS, rule.name) ? CONVERTERS[rule.name]?.(input) : undefined;
  }
}
