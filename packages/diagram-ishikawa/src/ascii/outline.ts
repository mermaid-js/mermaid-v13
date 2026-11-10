// The ishikawa outline as text (#586, D498): the effect in a box at the top, the causes below as
// a `tree(1)`-style tree in source order, hanging from a tee on the box's bottom border under the
// effect's first column. No left or right sides: the outline is the tree, not the fishbone. Its
// own printer (D498: treeView cannot be imported, a shared core one waits for a third user).
import {
  armOf,
  Canvas,
  cellWidth,
  DOWN,
  drawBox,
  drawText,
  glyphFor,
  LEFT,
  RIGHT,
  type GlyphSet,
} from '@mermaid-js/core/ascii';
import { eachCause, type IshikawaCause } from '../model.ts';

/** `tree(1)`'s connectors, a branch to a cause, to the last one, and the trunk past a cause. */
const TREE = {
  unicode: { tee: '├── ', last: '└── ', bar: '│   ' },
  ascii: { tee: '|-- ', last: '`-- ', bar: '|   ' },
} as const;

/** The column the tree's trunk hangs from: the effect's first, after the border and a space. */
const TRUNK = 2;

/**
 * The outline of `effect` (plain text) and `causes`, each written as `textOf` gives it: `\n`
 * line ends, no trailing spaces, never cropped (an `ASCII_TOO_WIDE` warning is the API's). The
 * front-matter `title` (one line, `labels.ts`), when given, is centred on the first line (D82).
 */
export function drawOutline(
  effect: string,
  causes: readonly IshikawaCause[],
  textOf: (cause: IshikawaCause) => string,
  glyphs: GlyphSet,
  title?: string
): string {
  const box = new Canvas();
  const width = cellWidth(effect) + 2 * TRUNK;
  drawBox(box, glyphs, { x: 0, y: 0, width, height: 3 });
  drawText(box, TRUNK, 1, effect);
  if (causes.length > 0)
    box.set(TRUNK, 2, glyphFor(armOf(LEFT, 1) | armOf(RIGHT, 1) | armOf(DOWN, 1), glyphs)!);
  const lines = box.toString().split('\n');
  const t = TREE[glyphs.name];
  // `prefixes[d]`: what comes before a depth-`d` cause's connector, the trunks of its ancestors.
  // In pre-order a cause's own causes follow it before any cause at its depth or above.
  const prefixes = ['', ' '.repeat(TRUNK)];
  eachCause(causes, (cause, depth, last) => {
    const prefix = prefixes[depth]!;
    lines.push(`${prefix}${last ? t.last : t.tee}${textOf(cause)}`.trimEnd());
    prefixes[depth + 1] = prefix + (last ? ' '.repeat(t.bar.length) : t.bar);
  });
  if (title) {
    const across = lines.reduce((m, l) => Math.max(m, cellWidth(l)), 0);
    lines.unshift(' '.repeat(Math.max(0, Math.floor((across - cellWidth(title)) / 2))) + title);
  }
  return lines.join('\n');
}
