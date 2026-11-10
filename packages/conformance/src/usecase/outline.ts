/**
 * Usecase's outline case (`OUTLINE_CASES`, D301, D302, #566, #567): actor glyphs, ovals, rects,
 * notes and JSON frames (`node`), JSON cells (`part`), boundary frames and tabs (`group`) and
 * relationship lines (`edge`).
 */
import { usecase } from '@mermaid-js/diagram-usecase';
import type { OutlineCase } from '../outline-cases.ts';

export const outline: OutlineCase = {
  plugin: usecase as unknown as OutlineCase['plugin'],
  dirs: ['usecase'],
  roles: ['edge', 'group', 'node', 'part'],
  // v12 drew the business marks with `append('path')`, never through roughjs; arrowheads and
  // label backgrounds are the shared plain shapes.
  plain: [/<path class="usecase-business-marker[^"]*"[^>]*\/>/g],
};
