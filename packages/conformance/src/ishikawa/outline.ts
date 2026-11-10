/** Ishikawa's outline case (`OUTLINE_CASES`, D494, #585): its head, label boxes and bones. */
import { ishikawa } from '@mermaid-js/diagram-ishikawa';
import type { OutlineCase } from '../outline-cases.ts';

export const outline: OutlineCase = {
  plugin: ishikawa as unknown as OutlineCase['plugin'],
  dirs: ['ishikawa'],
  roles: ['node', 'edge'],
  // Arrowheads are filled triangles after their bone, never sketched (D302), as the shared
  // `marker` arrowheads; every other ishikawa shape goes to the drawer.
  plain: [/<path class="ishikawa-arrow"[^>]*\/>/g],
};
