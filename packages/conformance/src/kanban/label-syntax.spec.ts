/**
 * Kanban labels by the label rule (spec #1368, #1407): column titles, card texts and cards in a
 * quoted string, through `createMermaid().render()`, over `pr-check/label-syntax*.mmd`.
 */
import { labelSyntaxSuite } from '../label-syntax.ts';

labelSyntaxSuite({
  folder: 'kanban',
  section: 'kanban',
  kinds: ['column', 'card', 'quoted card'],
  // A card in a markdown string or in bare backticks is the card's own way of writing.
  without: { 'quoted card': ['quoted', 'bare'] },
  quoted: 'kanban\n  c["`column **bold**`"]\n    k["`card _ital_`"]\n',
});
