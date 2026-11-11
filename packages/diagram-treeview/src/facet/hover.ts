/**
 * TreeView hover (DESIGN §4.5, D93, #576): a node's name shows whether it is a file or a
 * directory, its full path from v12's root `/`, and the icon it draws as `resolveIcon` resolves
 * it with the icon options the text sets (`showIcons`, `defaultIconPack`, the icon maps), and
 * why; its `icon(…)` shows that icon too. A keyword or `:::` the one-line doc of the grammar
 * file (`generated/docs.ts`). Never a preview.
 */
import type { DocumentView, Hover, HoverTarget } from '@mermaid-js/core/parser-kit';
import { treeviewDocs } from '../generated/docs.ts';
import {
  BUILTIN_ICON_PACK,
  detectIcon,
  isBuiltinIcon,
  resolveIcon,
  type TreeViewIconOptions,
} from '../icons.ts';
import type { TreeViewNode } from '../model.ts';
import type { TreeViewDocument } from '../parser/ast.ts';
import { writtenName } from '../parser/convert.ts';
import { textKeyword } from '../parser/parser.ts';
import { T } from '../parser/tokens.ts';
import { inside, statementAt } from './ranges.ts';
import { iconOptionsOf, pathOf, treeOf } from './tree.ts';
import { code, keywordHover } from '@mermaid-js/shared/parser/facet';
export { code } from '@mermaid-js/shared/parser/facet';

/** The keyword of a token that holds more than it (a text statement, `:::name`). */
const keywordOf = (kind: number): string | undefined =>
  kind === T.ClassAnnotation ? ':::' : textKeyword(kind);

/** What the node draws as its icon, and why. */
function iconLine(node: TreeViewNode, options: TreeViewIconOptions): string {
  const icon = resolveIcon(node, options);
  if (node.icon === 'none') return 'Icon: none, since its `icon(…)` hides it.';
  if (icon === undefined && !options.showIcons) {
    return 'Icon: none, since `showIcons` is off and it has no `icon(…)`.';
  }
  if (icon === undefined) return 'Icon: none, since the icon maps give it `none`.';
  const builtin = isBuiltinIcon(icon)
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
    const tree = treeOf(result);
    const node = tree.nodes.get(n.id);
    if (node && inside(at.offset, n.nameRange)) {
      const head = `**${node.directory ? 'directory' : 'file'}** ${code(writtenName(node.name, node.directory))}`;
      const path = `Path: ${code(pathOf(tree, node))}`;
      const icon = iconLine(node, iconOptionsOf(text));
      return { range: n.nameRange, contents: `${head}\n\n${path}\n\n${icon}` };
    }
    if (node && n.iconRange && inside(at.offset, n.iconRange)) {
      const written = text.slice(n.iconRange.start, n.iconRange.end);
      const icon = iconLine(node, iconOptionsOf(text));
      return {
        range: n.iconRange,
        contents: `**icon** ${code(written)} of ${code(node.name)}\n\n${icon}`,
      };
    }
  }
  const t = at.token;
  if (!t) return undefined;
  return keywordHover(text, at.offset, t.range, keywordOf(t.kind), treeviewDocs[t.kind]);
}
