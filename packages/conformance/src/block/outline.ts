/** Block's outline case (`OUTLINE_CASES`, D302, D447, #558): its leaf shapes and their inner lines. */
import { block } from '@mermaid-js/diagram-block';
import type { OutlineCase } from '../outline-cases.ts';

export const outline: OutlineCase = {
  plugin: block as unknown as OutlineCase['plugin'],
  dirs: ['block'],
  roles: ['divider', 'node'],
  // v12 sketched leaf shapes only (D447): composites, block arrows and edges stay plain.
  plain: [
    /<rect class="basic cluster composite label-container"[^>]*\/>/g,
    /<polygon class="label-container block-arrow"[^>]*\/>/g,
    /<path class="edge-thickness-[^>]*\/>/g,
  ],
};
