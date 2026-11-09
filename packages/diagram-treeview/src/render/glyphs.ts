/**
 * TreeView's two built-in glyphs, `file` and `folder` (D485): v12's `mermaid-treeview` pack
 * (`icons.ts`), drawn by the package itself, so the default tree needs no icons extension and no
 * pack is registered. v12's 24 × 24 bodies, written here in absolute commands (the writer's
 * `PathBuilder` takes no others) and scaled into the icon's square at the origin. Both fill with
 * `currentColor`, which the icon group's `color` sets (`treeViewIconColor`).
 */
import { pathBuilder, type Attrs, type PathData } from '@mermaid-js/core/svg';
import { BUILTIN_ICON_PACK, isBuiltinIcon } from '../icons.ts';

/** An absolute command: move, line, arc (rx ry rotation large sweep x y), close. */
type Command =
  | readonly ['M' | 'L', number, number]
  | readonly ['A', number, number, number, 0 | 1, 0 | 1, number, number]
  | readonly ['Z'];

/** The side of v12's glyph view box. */
const VIEW = 24;

/** v12 `folder`, `M10.59 4.59A2 2 0 0 0 9.17 4H4a2 2 0 0 0-2 2v12…h-7.17z`, made absolute. */
const FOLDER: readonly Command[] = [
  ['M', 10.59, 4.59],
  ['A', 2, 2, 0, 0, 0, 9.17, 4],
  ['L', 4, 4],
  ['A', 2, 2, 0, 0, 0, 2, 6],
  ['L', 2, 18],
  ['A', 2, 2, 0, 0, 0, 4, 20],
  ['L', 20, 20],
  ['A', 2, 2, 0, 0, 0, 22, 18],
  ['L', 22, 8],
  ['A', 2, 2, 0, 0, 0, 20, 6],
  ['L', 12.83, 6],
  ['Z'],
];

/**
 * v12 `file`, `M6 2a2 2 0 0 0-2 2v16…H6Zm7.5 1.9l4.6 4.6h-3.6a1 1 0 0 1-1-1V3.9Z`, made absolute:
 * even-odd, the folded corner cut out.
 */
const FILE: readonly Command[] = [
  ['M', 6, 2],
  ['A', 2, 2, 0, 0, 0, 4, 4],
  ['L', 4, 20],
  ['A', 2, 2, 0, 0, 0, 6, 22],
  ['L', 18, 22],
  ['A', 2, 2, 0, 0, 0, 20, 20],
  ['L', 20, 8.83],
  ['A', 2, 2, 0, 0, 0, 19.41, 7.41],
  ['L', 14.59, 2.59],
  ['A', 2, 2, 0, 0, 0, 13.17, 2],
  ['L', 6, 2],
  ['Z'],
  ['M', 13.5, 3.9],
  ['L', 18.1, 8.5],
  ['L', 14.5, 8.5],
  ['A', 1, 1, 0, 0, 1, 13.5, 7.5],
  ['L', 13.5, 3.9],
  ['Z'],
];

/** `commands` scaled from v12's 24-unit box into a `size` square at the origin. */
function scaled(commands: readonly Command[], size: number): PathData {
  const s = size / VIEW;
  const p = pathBuilder();
  for (const c of commands) {
    if (c[0] === 'Z') p.close();
    else if (c[0] === 'A')
      p.arcTo(c[1] * s, c[2] * s, c[3], c[4] === 1, c[5] === 1, c[6] * s, c[7] * s);
    else if (c[0] === 'M') p.moveTo(c[1] * s, c[2] * s);
    else p.lineTo(c[1] * s, c[2] * s);
  }
  return p.done();
}

/**
 * The `path` attributes of built-in glyph `name` (`mermaid-treeview:file` or `:folder`) in a
 * `size` square at the origin; undefined for any other name, which goes to `ctx.icon`.
 */
export function builtinGlyph(name: string, size: number): Attrs | undefined {
  if (!isBuiltinIcon(name)) return undefined;
  if (name === `${BUILTIN_ICON_PACK}:folder`)
    return { d: scaled(FOLDER, size), fill: 'currentColor' };
  return {
    d: scaled(FILE, size),
    fill: 'currentColor',
    'fill-rule': 'evenodd',
    'clip-rule': 'evenodd',
  };
}
