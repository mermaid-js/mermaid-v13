/** Sequence's outline case (`OUTLINE_CASES`, D302): in the identity check, with no roles. */
import { sequence } from '@mermaid-js/diagram-sequence';
import type { OutlineCase } from '../outline-cases.ts';

export const outline: OutlineCase = {
  plugin: sequence as unknown as OutlineCase['plugin'],
  dirs: ['sequence'],
};
