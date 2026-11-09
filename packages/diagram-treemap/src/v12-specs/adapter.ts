/**
 * Test-only adapter for the ported v12 treemap specs (R-TEST-3), backed by the v13 treemap
 * parse. The specs' expectations are kept as v12 wrote them; this file only translates names
 * and shapes:
 *
 * - `buildHierarchy(items)` stands for v12's `utils.ts`: the flat rows (`level`, `name`, `type`,
 *   `value`, `classSelector`) go through the parser's tree building, and the tree comes back in
 *   v12's `TreemapNode` shape (a leaf has no `children`, a section an array; v12's
 *   `cssCompiledStyles` pass-through is the model's `classStyles`, which no ported test reads);
 * - `createTreemapServices().Treemap.parser.LangiumParser.parse(text)` stands for
 *   `@mermaid-js/parser`'s Langium parser: `value` is the AST as Langium built it (`TreemapRows`
 *   in source order, a `classDef` row as a `ClassDefStatement`, the last of each text
 *   statement), and the errors are v13's syntax errors.
 */
import type { TreemapNode } from '../model.ts';
import type { TreemapRowNode } from '../parser/ast.ts';
import { buildTree } from '../parser/normalise.ts';
import { parseTreemap } from '../parser/parser.ts';

/** v12's `TreemapNode` as `buildHierarchy` returned it. */
interface V12Node {
  name: string;
  children?: V12Node[];
  value?: number;
  classSelector?: string;
}

interface V12Item {
  level: number;
  name: string;
  type: string;
  value?: number;
  classSelector?: string;
}

const RANGE = { start: 0, end: 0 };

/** v12 `buildHierarchy`, through the parser's tree building. */
export function buildHierarchy(items: V12Item[]): V12Node[] {
  const rows = items.map((item): TreemapRowNode => {
    const fields = {
      id: '',
      range: RANGE,
      name: item.name,
      nameRange: RANGE,
      indent: item.level,
      depth: 0,
    };
    const row: TreemapRowNode =
      item.type === 'Leaf'
        ? { ...fields, type: 'Leaf', value: item.value ?? NaN, valueText: '', valueRange: RANGE }
        : { ...fields, type: 'Section' };
    if (item.classSelector !== undefined) row.classSelector = item.classSelector;
    return row;
  });
  const v12 = (n: Omit<TreemapNode, 'astId'>): V12Node => {
    const out: V12Node = { name: n.name };
    if (n.type === 'Section') out.children = n.children.map(v12);
    if (n.value !== undefined) out.value = n.value;
    if (n.classSelector !== undefined) out.classSelector = n.classSelector;
    return out;
  };
  return buildTree(rows).map(v12);
}

interface LangiumItem {
  $type: 'Section' | 'Leaf';
  name: string;
  value?: number;
  classSelector?: string;
}

type LangiumRow =
  | { $type: 'TreemapRow'; indent?: number; item: LangiumItem }
  | { $type: 'ClassDefStatement'; indent?: number; className: string; styleText?: string };

interface LangiumTreemap {
  $type: 'Treemap';
  TreemapRows: LangiumRow[];
  title?: string;
  accTitle?: string;
  accDescr?: string;
}

interface LangiumResult {
  value: LangiumTreemap;
  lexerErrors: string[];
  parserErrors: string[];
}

function langiumParse(text: string): LangiumResult {
  const { ast, diagnostics } = parseTreemap(text);
  const value: LangiumTreemap = { $type: 'Treemap', TreemapRows: [] };
  for (const node of ast.children) {
    const indent = 'indent' in node && node.indent > 0 ? { indent: node.indent } : {};
    if (node.type === 'Section' || node.type === 'Leaf') {
      const item: LangiumItem = { $type: node.type, name: node.name };
      if (node.type === 'Leaf') item.value = node.value;
      if (node.classSelector !== undefined) item.classSelector = node.classSelector;
      value.TreemapRows.push({ $type: 'TreemapRow', ...indent, item });
    } else if (node.type === 'ClassDef') {
      value.TreemapRows.push({
        $type: 'ClassDefStatement',
        className: node.name,
        ...(node.styleText === undefined ? {} : { styleText: node.styleText }),
      });
    } else if (node.type === 'Title') value.title = node.text;
    else if (node.type === 'AccTitle') value.accTitle = node.text;
    else if (node.type === 'AccDescr') value.accDescr = node.text;
  }
  const errors = diagnostics.filter((d) => d.severity === 'error').map((d) => d.message);
  return { value, lexerErrors: [], parserErrors: errors };
}

/** `createTreemapServices().Treemap.parser.LangiumParser`, as the parser spec reads it. */
export function createTreemapServices(): {
  Treemap: { parser: { LangiumParser: { parse: (text: string) => LangiumResult } } };
} {
  return { Treemap: { parser: { LangiumParser: { parse: langiumParse } } } };
}

export function expectNoErrorsOrAlternatives(result: LangiumResult): void {
  if (result.lexerErrors.length > 0 || result.parserErrors.length > 0) {
    throw new Error([...result.lexerErrors, ...result.parserErrors].join('\n'));
  }
}
