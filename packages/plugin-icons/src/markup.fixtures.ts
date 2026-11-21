/** Writes fragments through core's writer, as `SvgWriter.label()` replays a box's node. */
import { streamWriter, writeFragment } from '@mermaid-js/core/svg';
import type { SvgFragment } from '@mermaid-js/core/text';

/** The markup of `nodes`, optionally inside a root `<svg>` with `viewBox`. */
export function markup(
  nodes: readonly SvgFragment[],
  viewBox?: readonly [number, number, number, number]
): string {
  const w = streamWriter();
  if (viewBox) w.open('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox });
  for (const node of nodes) writeFragment(w, node);
  if (viewBox) w.close();
  return w.finish();
}
