/** ER's outline case (`OUTLINE_CASES`, D302, #340). */
import { er } from '@mermaid-js/diagram-er';
import type { OutlineCase } from '../outline-cases.ts';

export const outline: OutlineCase = {
  plugin: er as unknown as OutlineCase['plugin'],
  dirs: ['er-diagram'],
  roles: ['node', 'part', 'divider', 'group', 'edge', 'label'],
};
