/** Agentflow's outline case (`OUTLINE_CASES`, D302, #548, #550): every shape it draws. */
import { agentflow } from '@mermaid-js/diagram-agentflow';
import type { OutlineCase } from '../outline-cases.ts';

export const outline: OutlineCase = {
  plugin: agentflow as unknown as OutlineCase['plugin'],
  dirs: ['agentflow'],
  // Vertices and the collapsed card (`node`), the tool's rails, the refdoc's rule and the card's
  // separator (`divider`), the card's dots (`mark`), flow frames (`group`) and edges (`edge`), as
  // v12 sketched shapes, frames and cards (D301).
  roles: ['node', 'divider', 'mark', 'group', 'edge'],
};
