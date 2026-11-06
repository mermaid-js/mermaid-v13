/** Writes fragments through core's writer, as `SvgWriter.label()` replays a box's node. */
import { streamWriter, type SvgWriter } from '@mermaid-js/core/svg';
import type { SvgFragment } from '@mermaid-js/core/text';

function write(w: SvgWriter, node: SvgFragment): void {
  if (!node.children || node.children.length === 0) {
    w.leaf(node.tag, node.attrs);
    return;
  }
  w.open(node.tag, node.attrs);
  for (const child of node.children) {
    if (typeof child === 'string') w.text(child);
    else write(w, child);
  }
  w.close();
}

/** The markup of `nodes`, optionally inside a root `<svg>` with `viewBox`. */
export function markup(
  nodes: readonly SvgFragment[],
  viewBox?: readonly [number, number, number, number]
): string {
  const w = streamWriter();
  if (viewBox) w.open('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox });
  for (const node of nodes) write(w, node);
  if (viewBox) w.close();
  return w.finish();
}
