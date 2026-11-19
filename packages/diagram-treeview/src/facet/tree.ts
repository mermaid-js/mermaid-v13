/**
 * What the treeView facet reads of a document beyond its parse (#576): each node's parent, for
 * its path, and the icon options the text sets.
 *
 * The tree (model node by AST id, parent by node) is read once per parse and kept with it (the
 * result is frozen and never changes), so hovering at every offset of a large tree stays linear;
 * a node's path is built only when asked for, by walking its parents, so a deep chain costs its
 * depth per hover, not its depth per node.
 *
 * The options come from the text alone: the front matter's `treeView` section, then each `init`
 * directive's (its `config` key read as the section too, as v12's `detectInit`), merged as the
 * config resolver merges them (a later value wins, a nullish one is skipped), and read by
 * `config.ts` as the layout reads them. A site config the service cannot see may change them.
 * They are kept for the last text asked about: completion parses again for its probe, so a
 * cache on the parse would never hit there.
 */
import type { TreeViewDiagramConfig } from '@mermaid-js/core/config';
import type { ParseResult } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { treeViewOptions } from '../config.ts';
import type { TreeViewIconOptions } from '../icons.ts';
import type { TreeViewModel, TreeViewNode } from '../model.ts';
import { writtenName } from '../parser/convert.ts';
import type { TreeViewDocument } from '../parser/ast.ts';
import { isPlain } from '@mermaid-js/shared/parser/facet';

export interface Tree {
  /** The model node of each AST node, by AST id. */
  readonly nodes: ReadonlyMap<string, TreeViewNode>;
  /** Each node's parent; a node at the top has none. */
  readonly parents: ReadonlyMap<TreeViewNode, TreeViewNode>;
}

const ICON_KEYS = ['showIcons', 'defaultIconPack', 'filenameIcons', 'extensionIcons'] as const;

/** The icon options as `text` sets them. */
function readIconOptions(text: string): TreeViewIconOptions {
  const pre = preprocess(text);
  const sections: unknown[] = [pre.frontMatter?.config?.treeView];
  for (const d of pre.directives) {
    if (d.kind !== 'init' || !isPlain(d.args)) continue;
    sections.push(d.args.treeView, d.args.config);
  }
  const merged: Record<string, unknown> = {};
  for (const s of sections) {
    if (!isPlain(s)) continue;
    for (const key of ICON_KEYS) merged[key] = s[key] ?? merged[key];
  }
  const { showIcons, defaultIconPack, filenameIcons, extensionIcons } = treeViewOptions(
    merged as TreeViewDiagramConfig
  );
  return {
    showIcons,
    defaultIconPack,
    ...(filenameIcons ? { filenameIcons } : {}),
    ...(extensionIcons ? { extensionIcons } : {}),
  };
}

// Kept module state, a one-entry cache of readIconOptions(), a pure function of the text.
let lastText: string | undefined;
let lastOptions: TreeViewIconOptions | undefined;

/** The icon options `text` sets (kept for the last text). */
export function iconOptionsOf(text: string): TreeViewIconOptions {
  if (lastOptions === undefined || text !== lastText) {
    lastOptions = readIconOptions(text);
    lastText = text;
  }
  return lastOptions;
}

const cache = new WeakMap<object, Tree>();

/** The {@link Tree} of `result`. */
export function treeOf(result: ParseResult<unknown, TreeViewDocument>): Tree {
  const known = cache.get(result);
  if (known) return known;
  const model = result.model as TreeViewModel;
  const nodes = new Map<string, TreeViewNode>();
  const parents = new Map<TreeViewNode, TreeViewNode>();
  for (const node of model.nodes) {
    nodes.set(node.astId, node);
    for (const c of node.children) parents.set(c, node);
  }
  const tree: Tree = { nodes, parents };
  cache.set(result, tree);
  return tree;
}

/** `node`'s path from v12's root `/`: `/app/src/index.js`, a directory's with its `/`. */
export function pathOf(tree: Tree, node: TreeViewNode): string {
  const names: string[] = [];
  for (let n: TreeViewNode | undefined = node; n; n = tree.parents.get(n)) {
    names.push(writtenName(n.name, n.directory));
  }
  // A directory's `/` joins it to the name after it.
  let path = '/';
  for (let k = names.length - 1; k >= 0; k--) {
    const name = names[k] ?? '';
    path += k > 0 && !name.endsWith('/') ? `${name}/` : name;
  }
  return path;
}
