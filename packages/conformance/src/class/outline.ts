/** Class's outline case (`OUTLINE_CASES`, D302, #340). */
import { classDiagram } from '@mermaid-js/diagram-class';
import type { OutlineCase } from '../outline-cases.ts';

export const outline: OutlineCase = {
  plugin: classDiagram as unknown as OutlineCase['plugin'],
  dirs: ['class-diagram'],
  roles: ['node', 'divider', 'group', 'edge'],
};
