/**
 * What the treeView facet reads of a document beyond its parse (#576): each node's path and the
 * icon options the text sets. Read once per parse and kept with it (the result is frozen and
 * never changes), so hovering at every offset of a large tree stays linear.
 *
 * The options come from the text alone: the front matter's `treeView` section, then each `init`
 * directive's (its `config` key read as the section too, as v12's `detectInit`), merged as the
 * config resolver merges them (a later value wins, a nullish one is skipped), and read by
 * `config.ts` as the layout reads them. A site config the service cannot see may change them.
 */
import type { TreeViewDiagramConfig } from '@mermaid-js/core/config';
import type { ParseResult } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { treeViewLayoutConfig } from '../config.ts';
import type { TreeViewIconOptions } from '../icons.ts';
import type { TreeViewModel, TreeViewNode } from '../model.ts';
import type { TreeViewDocument } from '../parser/ast.ts';

export interface Tree {
  /** The model node of each AST node, by AST id. */
  readonly nodes: ReadonlyMap<string, TreeViewNode>;
  /** Each node's path from v12's root `/`: `/app/src/index.js`, a directory's with its `/`. */
  readonly paths: ReadonlyMap<TreeViewNode, string>;
  readonly icons: TreeViewIconOptions;
}

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const ICON_KEYS = ['showIcons', 'defaultIconPack', 'filenameIcons', 'extensionIcons'] as const;

/** The icon options as the text sets them. */
function iconOptions(text: string): TreeViewIconOptions {
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
  const { showIcons, defaultIconPack, filenameIcons, extensionIcons } = treeViewLayoutConfig(
    merged as TreeViewDiagramConfig
  );
  return {
    showIcons,
    defaultIconPack,
    ...(filenameIcons ? { filenameIcons } : {}),
    ...(extensionIcons ? { extensionIcons } : {}),
  };
}

const cache = new WeakMap<object, Tree>();

const written = (n: TreeViewNode) => `${n.name}${n.directory ? '/' : ''}`;

/** The {@link Tree} of `result`, a parse of `text`. */
export function treeOf(text: string, result: ParseResult<unknown, TreeViewDocument>): Tree {
  const known = cache.get(result);
  if (known) return known;
  const model = result.model as TreeViewModel;
  const nodes = new Map<string, TreeViewNode>();
  const paths = new Map<TreeViewNode, string>();
  // Parents come before their children: no recursion, a tree may be deep.
  const stack: { node: TreeViewNode; base: string }[] = model.roots
    .map((node) => ({ node, base: '/' }))
    .reverse();
  for (let top = stack.pop(); top; top = stack.pop()) {
    const { node, base } = top;
    const path = `${base}${written(node)}`;
    nodes.set(node.astId, node);
    paths.set(node, path);
    const under = path.endsWith('/') ? path : `${path}/`;
    for (let k = node.children.length - 1; k >= 0; k--) {
      const c = node.children[k];
      if (c) stack.push({ node: c, base: under });
    }
  }
  const tree: Tree = { nodes, paths, icons: iconOptions(text) };
  cache.set(result, tree);
  return tree;
}
