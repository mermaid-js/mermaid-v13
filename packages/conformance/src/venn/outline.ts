/** Venn's outline case (`OUTLINE_CASES`, D319, #501): its circles and filled overlaps. */
import { venn } from '@mermaid-js/diagram-venn';
import type { OutlineCase } from '../outline-cases.ts';

export const outline: OutlineCase = {
  plugin: venn as unknown as OutlineCase['plugin'],
  dirs: ['venn'],
  roles: ['node'],
  // v12 sketched each circle and an overlap a style fills; an unfilled overlap is a transparent
  // path, and `useDebugLayout`'s dashed circle and cells were never sketched.
  plain: [
    /<path d="[^"]*" fill="transparent" fill-opacity="0"\/>/g,
    /<circle class="venn-text-debug-circle"[^>]*\/>/g,
    /<rect class="venn-text-debug-cell"[^>]*\/>/g,
  ],
};
