/**
 * The treemap model as v12 built it (`parser.ts` `populate`, `utils.ts` `buildHierarchy`,
 * `db.ts`; parser-method §4): from the parsed rows to the {@link TreemapModel}. Classes are
 * collected first, so a row may use a class defined after it; a repeated `classDef` appends.
 * Rows nest by indent: the stack pops while its top's indent is at least the row's, only
 * sections are pushed, so a row indented under a leaf joins the leaf's parent. There are no
 * semantic errors; D402's one warning lists the values v12 read as `NaN` or not as written.
 */
import type { AstId, Diagnostics } from '@mermaid-js/core/parser-kit';
import type { TreemapClass, TreemapModel, TreemapNode } from '../model.ts';
import type { TreemapClassDefNode, TreemapLeafNode, TreemapRowNode } from './ast.ts';
import { isPlainNumber } from './convert.ts';
import { idEscaper } from '@mermaid-js/core/parser-kit/support';

/** D402: a value v12 read as `NaN`, or not as written (`1_000`, `1,2,3`, `1.2.3`). */
export const TREEMAP_INVALID_VALUE = 'TREEMAP_INVALID_VALUE';

/** What the parser read, for {@link normalise}. */
export interface TreemapParts {
  /** Section and leaf rows in source order, `depth` and `id` not set yet. */
  readonly rows: readonly TreemapRowNode[];
  /** Each `classDef` with its styles split as v12 split them. */
  readonly classDefs: readonly ClassDefRead[];
  /** The last in-text values ('' when none). */
  readonly title: string;
  readonly titleAstId: AstId | undefined;
  readonly accTitle: string;
  readonly accDescr: string;
  readonly frontMatterTitle: string | undefined;
}

/** A `classDef` and its styles. */
export interface ClassDefRead {
  readonly node: TreemapClassDefNode;
  readonly styles: readonly string[];
  readonly textStyles: readonly string[];
}

/** `%`, `/` and `@` percent-encoded, so a name path reads back one way. */
const escapeName = /* @__PURE__ */ idEscaper('%/@');

/** Mutable while the tree is built; frozen into a {@link TreemapNode}. */
interface Building {
  type: TreemapNode['type'];
  name: string;
  value?: number;
  classSelector?: string;
  depth: number;
  children: Building[];
  astId: AstId;
}

/**
 * Place the rows in the tree (v12 `buildHierarchy`), setting each row node's `depth` and `id`
 * (its name path, `@n` for a repeat). Returns the top rows.
 */
export function buildTree(rows: readonly TreemapRowNode[]): Building[] {
  const roots: Building[] = [];
  const stack: { node: Building; indent: number; path: string }[] = [];
  const paths = new Map<string, number>();
  for (const row of rows) {
    while (stack.length > 0 && (stack[stack.length - 1]?.indent ?? 0) >= row.indent) stack.pop();
    const parent = stack[stack.length - 1];
    const path = parent ? `${parent.path}/${escapeName(row.name)}` : escapeName(row.name);
    const n = (paths.get(path) ?? 0) + 1;
    paths.set(path, n);
    const astId = n === 1 ? `node:${path}` : `node:${path}@${n}`;
    row.id = astId;
    row.depth = stack.length;
    const node: Building = {
      type: row.type,
      name: row.name,
      depth: stack.length,
      children: [],
      astId,
    };
    if (row.type === 'Leaf') node.value = row.value;
    if (row.classSelector !== undefined) node.classSelector = row.classSelector;
    (parent ? parent.node.children : roots).push(node);
    if (row.type === 'Section') stack.push({ node, indent: row.indent, path });
  }
  return roots;
}

function freeze(node: Building): TreemapNode {
  const out: { -readonly [K in keyof TreemapNode]: TreemapNode[K] } = {
    type: node.type,
    name: node.name,
    depth: node.depth,
    children: Object.freeze(node.children.map(freeze)),
    astId: node.astId,
  };
  if (node.value !== undefined) out.value = node.value;
  if (node.classSelector !== undefined) out.classSelector = node.classSelector;
  return Object.freeze(out);
}

/** v12's class map: every `classDef` in source order, a repeat appending to the first. */
function classes(defs: readonly ClassDefRead[]): TreemapClass[] {
  const byName = new Map<
    string,
    { name: string; styles: string[]; textStyles: string[]; astId: AstId }
  >();
  for (const { node, styles, textStyles } of defs) {
    let c = byName.get(node.name);
    if (!c) {
      c = { name: node.name, styles: [], textStyles: [], astId: node.id };
      byName.set(node.name, c);
    }
    c.styles.push(...styles);
    c.textStyles.push(...textStyles);
  }
  return [...byName.values()].map((c) =>
    Object.freeze({
      ...c,
      styles: Object.freeze(c.styles),
      textStyles: Object.freeze(c.textStyles),
    })
  );
}

const show = (n: number): string => (Number.isNaN(n) ? 'not a number' : String(n));

/** D402: one warning per parse, at the first such value, the others related. */
function invalidValues(rows: readonly TreemapRowNode[], diagnostics: Diagnostics): void {
  const bad = rows.filter(
    (r): r is TreemapLeafNode => r.type === 'Leaf' && !isPlainNumber(r.valueText)
  );
  const [first, ...rest] = bad;
  if (!first) return;
  const listed = bad.slice(0, 5).map((r) => `\`${r.valueText}\` (read as ${show(r.value)})`);
  if (bad.length > 5) listed.push(`${bad.length - 5} more`);
  const related = rest.map((r) => ({
    message: `\`${r.valueText}\` is read as ${show(r.value)}`,
    range: r.valueRange,
  }));
  diagnostics.warning(
    TREEMAP_INVALID_VALUE,
    `Some values are not plain numbers: ${listed.join(', ')}. Write digits, with \`.\` before the decimals and \`,\` only between groups of three; a value that is not a number takes no area.`,
    first.valueRange,
    related.length > 0 ? { related } : undefined
  );
}

/** The model of a parse. */
export function normalise(
  parts: TreemapParts,
  diagnostics: Diagnostics
): Omit<TreemapModel, 'warnings'> {
  const roots = buildTree(parts.rows).map(freeze);
  invalidValues(parts.rows, diagnostics);
  const model: { -readonly [K in keyof TreemapModel]?: TreemapModel[K] } = {
    roots: Object.freeze(roots),
    classes: Object.freeze(classes(parts.classDefs)),
    accTitle: parts.accTitle,
    accDescr: parts.accDescr,
  };
  if (parts.title !== '') {
    model.title = parts.title;
    if (parts.titleAstId !== undefined) model.titleAstId = parts.titleAstId;
  } else if (parts.frontMatterTitle !== undefined && parts.frontMatterTitle !== '') {
    model.title = parts.frontMatterTitle;
  }
  return model as Omit<TreemapModel, 'warnings'>;
}
