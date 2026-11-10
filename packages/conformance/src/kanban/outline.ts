/** Kanban's outline case (`OUTLINE_CASES`, D379, #459): its columns and cards. */
import { kanban } from '@mermaid-js/diagram-kanban';
import type { OutlineCase } from '../outline-cases.ts';

export const outline: OutlineCase = {
  plugin: kanban as unknown as OutlineCase['plugin'],
  dirs: ['kanban'],
  roles: ['group', 'node'],
  // The priority bar is a vertical line (x1 = x2): a zero-width box, which an outline
  // cannot fill or hachure (as D185's lines), so it stays a plain line, kept under hand-drawn
  // (D379). Every other kanban shape goes to the drawer.
  plain: [/<line class="kanban-priority" x1="([^"]+)" y1="[^"]+" x2="\1"[^>]*\/>/g],
};
