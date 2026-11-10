/** Flowchart's outline case (`OUTLINE_CASES`, D302, #340). */
import { flowchart } from '@mermaid-js/diagram-flowchart';
import type { OutlineCase } from '../outline-cases.ts';

export const outline: OutlineCase = {
  plugin: flowchart as unknown as OutlineCase['plugin'],
  dirs: ['flowchart'],
  roles: ['node', 'part', 'divider', 'mark', 'group', 'edge'],
};
