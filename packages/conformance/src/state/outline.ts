/** State's outline case (`OUTLINE_CASES`, D302, #340). */
import { state } from '@mermaid-js/diagram-state';
import type { OutlineCase } from '../outline-cases.ts';

export const outline: OutlineCase = {
  plugin: state as unknown as OutlineCase['plugin'],
  dirs: ['state-diagram', 'state-diagram-v2'],
  roles: ['node', 'part', 'divider', 'mark', 'group', 'edge'],
};
