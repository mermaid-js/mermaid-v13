// What treeView text output cannot show (D82, D488, R-ASCII-5): one `ASCII_DROPPED` warning per
// feature kind, naming the AST ids of what it dropped. A highlight is drawn (its gutter mark,
// D488) and a directory's bold and a description's italics are the renderer's, not the
// author's, so none of them is named.
import type { TreeViewDiagramConfig } from '@mermaid-js/core/config';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { treeViewOptions } from '../config.ts';
import { resolveIcon } from '../icons.ts';
import { highlighted, type TreeViewModel } from '../model.ts';
import { asciiDropped } from '@mermaid-js/shared/ascii';
import type { AsciiDroppedWarning as SharedAsciiDroppedWarning } from '@mermaid-js/shared/ascii';

/** The feature kinds an `ASCII_DROPPED` warning names, in the order they are reported. */
export type AsciiDroppedFeature = 'icon' | 'style' | 'accessibility';

/** One feature kind text output dropped (D82). */
export type AsciiDroppedWarning = SharedAsciiDroppedWarning<AsciiDroppedFeature>;

const WHAT: Record<AsciiDroppedFeature, string> = {
  icon: 'icons (names kept)',
  style: 'classes other than highlight (:::name)',
  accessibility: 'accTitle and accDescr',
};

/**
 * The warnings for one drawing of `model` under the `treeView` options `section`: the nodes the
 * SVG draws an icon for (`resolveIcon`, `showIcons` and the icon maps included), the nodes with
 * a class that is not `highlight`, and the accessibility statements of `ast`.
 */
export function asciiWarnings(
  model: TreeViewModel,
  section: Readonly<TreeViewDiagramConfig> | undefined,
  ast?: AstNode
): AsciiDroppedWarning[] {
  const options = treeViewOptions(section);
  const found: Record<AsciiDroppedFeature, string[]> = { icon: [], style: [], accessibility: [] };
  for (const node of model.nodes) {
    if (resolveIcon(node, options) !== undefined) found.icon.push(node.astId);
    if (node.cssClass !== undefined && !highlighted(node)) found.style.push(node.astId);
  }
  for (const s of ast?.children ?? [])
    if (s.type === 'AccTitle' || s.type === 'AccDescr') found.accessibility.push(s.id);
  const acc = model.accTitle.trim() !== '' || model.accDescr.trim() !== '';
  return (Object.keys(WHAT) as AsciiDroppedFeature[]).flatMap((feature) => {
    const astIds = found[feature];
    if (astIds.length === 0 && !(feature === 'accessibility' && acc)) return [];
    return [asciiDropped(feature, astIds, WHAT[feature])];
  });
}
