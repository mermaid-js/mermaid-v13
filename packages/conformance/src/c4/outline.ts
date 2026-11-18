/**
 * C4's outline case (`OUTLINE_CASES`, D301, D302, #542): each element's outline (`node`), the
 * cylinder's and the queue's rims and `fr-rect`'s frame lines (`divider`), and each relation
 * label's tag (`label`, D630).
 */
import { c4 } from '@mermaid-js/diagram-c4';
import type { OutlineCase } from '../outline-cases.ts';

export const outline: OutlineCase = {
  plugin: c4 as unknown as OutlineCase['plugin'],
  dirs: ['c4'],
  roles: ['divider', 'label', 'node'],
  // v12 sketched elements only (D301): boundary frames and relation lines stay plain (arrowheads
  // and text are the shared plain shapes). A relation label's border is sketched, as every edge
  // label's (D630).
  plain: [/<g class="c4-boundary[^"]*"[^>]*><rect [^>]*\/>/g, /<path class="c4-rel [^>]*\/>/g],
};
