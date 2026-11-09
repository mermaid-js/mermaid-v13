/**
 * The treeView model as v12 built it (`db.ts` `addNode`, parser-method §4): from the parsed
 * nodes to the {@link TreeViewModel}. v12 kept a stack over a virtual root at level -1 and, for
 * each node, popped while the node's level was at most the top's, then hung the node under the
 * new top: a node's parent is the nearest earlier node with a smaller level, so irregular
 * indents are fine. There are no semantic errors.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { TreeViewModel, TreeViewNode } from '../model.ts';
import type { TreeViewNodeNode } from './ast.ts';

/** What the parser read, for {@link normalise}. */
export interface TreeViewParts {
  /** The nodes in source order, `depth` and `id` not set yet. */
  readonly nodes: readonly TreeViewNodeNode[];
  /** The last non-empty in-text values ('' when none), as commonDb kept them. */
  readonly title: string;
  readonly titleAstId: AstId | undefined;
  readonly accTitle: string;
  readonly accDescr: string;
  readonly frontMatterTitle: string | undefined;
}

/** `%`, `/` and `@` percent-encoded, so a name path reads back one way. */
const escapeName = (name: string): string =>
  /[%/@]/.test(name)
    ? name.replace(/[%/@]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    : name;

type Mutable = { -readonly [K in keyof TreeViewNode]: TreeViewNode[K] } & {
  children: TreeViewNode[];
};

/**
 * Place the nodes in the tree (v12 `addNode`), setting each AST node's `depth` and `id` (its
 * name path, `@n` for a repeat in one directory). Returns the model's nodes in source order
 * (the tree's preorder), frozen, and the top ones. No recursion: a tree may be deep.
 */
export function buildTree(nodes: readonly TreeViewNodeNode[]): {
  nodes: TreeViewNode[];
  roots: TreeViewNode[];
} {
  const roots: TreeViewNode[] = [];
  const all: Mutable[] = [];
  const stack: { m: Mutable; level: number; path: string }[] = [];
  const paths = new Map<string, number>();
  for (const n of nodes) {
    while (stack.length > 0 && n.level <= (stack[stack.length - 1]?.level ?? -1)) stack.pop();
    const parent = stack[stack.length - 1];
    const path = parent ? `${parent.path}/${escapeName(n.name)}` : escapeName(n.name);
    const count = (paths.get(path) ?? 0) + 1;
    paths.set(path, count);
    n.id = count === 1 ? `node:${path}` : `node:${path}@${count}`;
    n.depth = stack.length;
    const m: Mutable = {
      name: n.name,
      directory: n.directory,
      depth: n.depth,
      level: n.level,
      children: [],
      astId: n.id,
      range: Object.freeze({ ...n.range }),
    };
    if (n.icon !== undefined) m.icon = n.icon;
    if (n.cssClass !== undefined) m.cssClass = n.cssClass;
    if (n.description !== undefined) m.description = n.description;
    (parent ? parent.m.children : roots).push(m);
    all.push(m);
    stack.push({ m, level: n.level, path });
  }
  // Children come after their parent in source order: freeze from the end.
  for (let i = all.length - 1; i >= 0; i--) {
    const m = all[i]!;
    Object.freeze(m.children);
    Object.freeze(m);
  }
  return { nodes: all, roots };
}

/** The model of a parse, without its warnings. */
export function normalise(parts: TreeViewParts): Omit<TreeViewModel, 'warnings'> {
  const { nodes, roots } = buildTree(parts.nodes);
  const model: { -readonly [K in keyof TreeViewModel]?: TreeViewModel[K] } = {
    roots: Object.freeze(roots),
    nodes: Object.freeze(nodes),
    accTitle: parts.accTitle,
    accDescr: parts.accDescr,
  };
  if (parts.title !== '') {
    model.title = parts.title;
    if (parts.titleAstId !== undefined) model.titleAstId = parts.titleAstId;
  } else if (parts.frontMatterTitle !== undefined && parts.frontMatterTitle !== '') {
    model.title = parts.frontMatterTitle;
  }
  return model as Omit<TreeViewModel, 'warnings'>;
}
