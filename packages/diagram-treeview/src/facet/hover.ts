/**
 * TreeView hover (DESIGN §4.5, D93, #576): a node's name shows whether it is a file or a
 * directory, its full path from v12's root `/`, and the icon it draws as `resolveIcon` resolves
 * it with the icon options the text sets (`showIcons`, `defaultIconPack`, the icon maps), and
 * why; its `icon(…)` shows that icon too. A keyword or `:::` the one-line doc of the grammar
 * file (`generated/docs.ts`). Never a preview.
 */
import type { DocumentView, Hover, HoverTarget } from '@mermaid-js/core/parser-kit';
import { treeviewDocs } from '../generated/docs.ts';
import { BUILTIN_ICON_PACK, detectIcon, resolveIcon } from '../icons.ts';
import type { TreeViewIconOptions } from '../icons.ts';
import type { TreeViewNode } from '../model.ts';
import type { TreeViewDocument } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { code, inside, span, statementAt } from './tables.ts';
import { treeOf } from './tree.ts';

/** Tokens that hold the statement's text too: only their keyword is hovered. */
const KEYWORD_WORDS: Readonly<Partial<Record<number, string>>> = {
  [T.Title]: 'title',
  [T.AccTitle]: 'accTitle',
  [T.AccDescr]: 'accDescr',
  [T.ClassAnnotation]: ':::',
};

/** What the node draws as its icon, and why. */
function iconLine(node: TreeViewNode, options: TreeViewIconOptions): string {
  const icon = resolveIcon(node, options);
  if (node.icon === 'none') return 'Icon: none, since its `icon(…)` hides it.';
  if (icon === undefined && !options.showIcons) {
    return 'Icon: none, since `showIcons` is off and it has no `icon(…)`.';
  }
  if (icon === undefined) return 'Icon: none, since the icon maps give it `none`.';
  const builtin = icon.startsWith(`${BUILTIN_ICON_PACK}:`)
    ? `, the built-in ${icon.slice(BUILTIN_ICON_PACK.length + 1)} glyph`
    : '';
  let from = '';
  if (node.icon !== undefined) from = ', from its `icon(…)`';
  else if (!node.directory && detectIcon(node.name, options) !== undefined)
    from = ', from the icon maps';
  return `Icon: ${code(icon)}${builtin}${from}.`;
}

export function treeViewHover(
  at: HoverTarget,
  doc: DocumentView<TreeViewDocument>
): Hover | undefined {
  const { text, result } = doc;
  const n = statementAt(result.ast, at.offset);
  if (n?.type === 'Node') {
    const tree = treeOf(text, result);
    const node = tree.nodes.get(n.id);
    if (node && inside(at.offset, n.nameRange)) {
      const head = `**${node.directory ? 'directory' : 'file'}** ${code(`${node.name}${node.directory ? '/' : ''}`)}`;
      const path = `Path: ${code(tree.paths.get(node) ?? '')}`;
      return {
        range: n.nameRange,
        contents: `${head}\n\n${path}\n\n${iconLine(node, tree.icons)}`,
      };
    }
    if (node && n.iconRange && inside(at.offset, n.iconRange)) {
      const written = text.slice(n.iconRange.start, n.iconRange.end);
      return {
        range: n.iconRange,
        contents: `**icon** ${code(written)} of ${code(node.name)}\n\n${iconLine(node, tree.icons)}`,
      };
    }
  }
  const t = at.token;
  if (!t) return undefined;
  let range = t.range;
  const word = KEYWORD_WORDS[t.kind];
  if (word !== undefined) {
    const start =
      range.start + (/^[\t ]*/.exec(text.slice(range.start, range.end))?.[0].length ?? 0);
    range = span(start, start + word.length);
  }
  if (!inside(at.offset, range)) return undefined;
  const docText = treeviewDocs[t.kind];
  if (docText === undefined) return undefined;
  return { range, contents: `**${code(text.slice(range.start, range.end))}**\n\n${docText}` };
}
