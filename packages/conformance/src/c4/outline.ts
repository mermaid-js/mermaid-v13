/**
 * C4's outline case (`OUTLINE_CASES`, D301, D302, #542): each element's outline (`node`) and the
 * cylinder's and the queue's rims and `fr-rect`'s frame lines (`divider`).
 */
import { c4 } from '@mermaid-js/diagram-c4';
import type { OutlineCase } from '../outline-cases.ts';

export const outline: OutlineCase = {
  plugin: c4 as unknown as OutlineCase['plugin'],
  dirs: ['c4'],
  roles: ['divider', 'node'],
  // v12 sketched elements only (D301): boundary frames, relation lines and relation-label boxes
  // stay plain (arrowheads and text are the shared plain shapes).
  plain: [
    /<g class="c4-boundary[^"]*"[^>]*><rect [^>]*\/>/g,
    /<path class="c4-rel [^>]*\/>/g,
    /<rect class="c4-rel-label-box"[^>]*\/>/g,
  ],
};
