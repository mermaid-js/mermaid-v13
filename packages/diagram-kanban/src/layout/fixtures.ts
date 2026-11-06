// cspell:words Sveidqvist knsv KNBN
/**
 * Hand-built `KanbanLayoutInput`s for the layout specs (spec #424 T3), written while T2's
 * parser (#453) runs in parallel: the input each corpus file (`e2e/diagrams/kanban/**`) gives
 * once T2's `KanbanModel` is adapted, plus edge cases the corpus lacks. When T2 lands, these
 * become parser-produced (GAPS #455).
 *
 * `board()` hands out AST ids as T2 does (D289): `n:<id>` for columns and cards alike, the k-th
 * repeat `n:<id>@k`, and an id-less item's id is its text, blanks trimmed.
 */
import { AstIds } from '@mermaid-js/core/parser-kit';
import type { Measurer } from '@mermaid-js/core/text';
import type { KanbanLayoutCard, KanbanLayoutColumn, KanbanLayoutInput } from './input.ts';

interface CardLine {
  readonly id: string;
  readonly title: string;
  readonly ticket?: string;
  readonly assigned?: string;
  readonly priority?: string;
}
interface ColumnLine {
  readonly id: string;
  readonly title: string;
  readonly cards: readonly CardLine[];
}

type Meta = Pick<CardLine, 'ticket' | 'assigned' | 'priority'>;

/** `id[title]@{ … }` at card level; `title` defaults to the id (a bare id). */
export const card = (id: string, title = id, meta: Meta = {}): CardLine => ({
  id,
  title,
  ...meta,
});

/** `id[title]` at column level, then its cards. */
export const column = (id: string, title = id, ...cards: CardLine[]): ColumnLine => ({
  id,
  title,
  cards,
});

/** The input for these columns, with T2's AST ids in source order. */
export function board(...columns: ColumnLine[]): KanbanLayoutInput {
  const ids = new AstIds();
  const ast = (id: string): string => ids.node(id.trim());
  return {
    columns: columns.map(
      (c): KanbanLayoutColumn => ({
        ast: ast(c.id),
        title: c.title,
        cards: c.cards.map(
          (k): KanbanLayoutCard => ({
            ast: ast(k.id),
            title: k.title,
            ...(k.ticket === undefined ? {} : { ticket: k.ticket }),
            ...(k.assigned === undefined ? {} : { assigned: k.assigned }),
            ...(k.priority === undefined ? {} : { priority: k.priority }),
          })
        ),
      })
    ),
  };
}

/**
 * A measurer with round numbers, for geometry specs: every character is 8 px wide and a line is
 * 24 px high, the line height v12's default HTML labels measured (16 px trebuchet).
 */
export const gridMeasurer: Measurer = {
  id: 'kanban-grid',
  width: (text) => [...text].length * 8,
  metrics: () => ({ ascent: 18, descent: 6, lineHeight: 24 }),
};

export interface Fixture {
  readonly input: KanbanLayoutInput;
  /** The fixture's `kanban` front-matter config. */
  readonly config?: Readonly<Record<string, unknown>>;
}

const LONG_TITLE =
  'Title of diagram is more than 100 chars when user duplicates diagram with 100 char';
const WRAPPING = `${LONG_TITLE}, wrapping`;
const RENDERER =
  'Create renderer so that it works in all cases. We also add some extra text here for testing purposes. And some more just for the extra flare.';
const BLOG = 'Create Blog about the new diagram';

/** The 15 columns of the flat `10-full-example` (`columns-only-full-example.mmd`). */
const FLAT_FULL: readonly [string, string][] = [
  ['id1', 'Todo'],
  ['docs', 'Create Documentation'],
  ['docs', BLOG],
  ['id7', 'In progress'],
  ['id6', RENDERER],
  ['id8', 'Design grammar'],
  ['id9', 'Ready for deploy'],
  ['id10', 'Ready for test'],
  ['id11', 'Done'],
  ['id5', 'define getData'],
  ['id2', LONG_TITLE],
  ['id3', 'Update DB function'],
  ['id4', 'Create parsing tests'],
  ['id66', 'last item'],
  ['id12', "Can't reproduce"],
];

/** Corpus files (by file name under `e2e/diagrams/kanban/`) and edge cases. */
export const FIXTURES: Readonly<Record<string, Fixture>> = {
  '1-should-render-a-kanban-with-a-single-section': {
    input: board(column('id1', 'Todo', card('docs', 'Create Documentation'), card('docs', BLOG))),
  },
  '10-full-example': {
    config: { ticketBaseUrl: 'https://abc123.atlassian.net/browse/#TICKET#' },
    input: board(
      column('id1', 'Todo', card('docs', 'Create Documentation'), card('docs', BLOG)),
      column(
        'id7',
        'In progress',
        card('id6', RENDERER),
        card('id8', 'Design grammar', { assigned: 'knsv' })
      ),
      column('id9', 'Ready for deploy'),
      column('id10', 'Ready for test'),
      column(
        'id11',
        'Done',
        card('id5', 'define getData'),
        card('id2', LONG_TITLE, { ticket: 'MC-2036', priority: 'Very High' }),
        card('id3', 'Update DB function', {
          ticket: 'MC-2037',
          assigned: 'knsv',
          priority: 'High',
        }),
        card('id4', 'Create parsing tests', {
          ticket: 'MC-2038',
          assigned: 'K.Sveidqvist',
          priority: 'High',
        }),
        card('id66', 'last item', { priority: 'Very Low', assigned: 'knsv' })
      ),
      column('id12', "Can't reproduce")
    ),
  },
  '2-should-render-a-kanban-with-multiple-sections': {
    input: board(
      column('id1', 'Todo', card('docs', 'Create Documentation')),
      column('id2', 'id2', card('docs', BLOG))
    ),
  },
  '3-should-render-a-kanban-with-a-single-wrapping-node': {
    input: board(column('id1', 'Todo', card('id2', WRAPPING))),
  },
  '4-should-handle-the-height-of-a-section-with-a-wrapping-node-at-the-end': {
    input: board(column('id1', 'Todo', card('id2', 'One line'), card('id3', WRAPPING))),
  },
  '5-should-handle-the-height-of-a-section-with-a-wrapping-node-at-the-top': {
    input: board(column('id1', 'Todo', card('id2', WRAPPING), card('id3', 'One line'))),
  },
  '6-should-handle-the-height-of-a-section-with-a-wrapping-node-in-the-middle': {
    input: board(
      column('id1', 'Todo', card('id2', 'One line'), card('id3', WRAPPING), card('id4', 'One line'))
    ),
  },
  '7-should-handle-prioritization': {
    input: board(
      column(
        'id2',
        'In progress',
        card('vh', 'Very High', { priority: 'Very High' }),
        card('h', 'High', { priority: 'High' }),
        card('m', 'Default priority'),
        card('l', 'Low', { priority: 'Low' }),
        card('vl', 'Very Low', { priority: 'Very Low' })
      )
    ),
  },
  '8-should-handle-assignments-prioritization-and-tickets-ids-in-the-same-item': {
    input: board(
      column(
        'id2',
        'In progress',
        card('docs', BLOG, { priority: 'Very Low', ticket: 'MC-2037', assigned: 'knsv' })
      )
    ),
  },
  'columns-only-full-example': {
    input: board(...FLAT_FULL.map(([id, title]) => column(id, title))),
  },
  'cards-at-any-depth': {
    // Depth makes no difference past the column level: all are cards of the last column.
    input: board(
      column(
        'Todo',
        'Todo',
        card('a', 'Card at indent 4'),
        card('b', 'Card at indent 6, still a card of Todo'),
        card('c', 'Card at indent 8'),
        card('d', 'Back at indent 4')
      ),
      column(
        'Done',
        'Done',
        card('e', 'First card, at indent 6'),
        card('f', 'Second card, at indent 4')
      )
    ),
  },
  'misplaced-indent': {
    // The shallow last item is a card of Done (v12 spec KNBN-6).
    input: board(
      column('Todo', 'Todo', card('a', 'Card')),
      column(
        'Done',
        'Done',
        card('b', 'Card'),
        card('c', 'Shallower than the column level: a card of Done')
      )
    ),
  },
  'example-personal-board': {
    input: board(
      column(
        'Todo',
        'Todo',
        card('Buy groceries', 'Buy groceries'),
        card('Book dentist appointment', 'Book dentist appointment')
      ),
      column('In progress', 'In progress', card('Plan weekend trip', 'Plan weekend trip')),
      column(
        'Done',
        'Done',
        card('Pay electricity bill', 'Pay electricity bill'),
        card('Renew gym membership', 'Renew gym membership')
      )
    ),
  },
  'knsv2-46-kanban-tickets': {
    input: board(
      column(
        'Todo',
        'Todo',
        card('Create Documentation', 'Create Documentation'),
        card('docs', BLOG)
      ),
      column('id7', 'In progress', card('id6', RENDERER)),
      column('id9', 'Ready for deploy', card('id8', 'Design grammar', { assigned: 'knsv' })),
      column(
        'id10',
        'Ready for test',
        card('id4', 'Create parsing tests', {
          ticket: 'MC-2038',
          assigned: 'K.Sveidqvist',
          priority: 'High',
        }),
        card('id66', 'last item', { priority: 'Very Low', assigned: 'knsv' })
      ),
      column(
        'id11',
        'Done',
        card('id5', 'define getData'),
        card('id2', LONG_TITLE, { ticket: 'MC-2036', priority: 'Very High' }),
        card('id3', 'Update DB function', {
          ticket: 'MC-2037',
          assigned: 'knsv',
          priority: 'High',
        })
      ),
      column('id12', "Can't reproduce", card('id3', 'Weird flickering in Firefox'))
    ),
  },
  'priority-other-values': {
    // `priority: 1` is not a string: the adapter passes no priority.
    input: board(
      column(
        'todo',
        'Todo',
        card('a', 'Medium', { priority: 'Medium' }),
        card('b', 'Lower case', { priority: 'high' }),
        card('c', 'A number'),
        card('d', 'Unknown word', { priority: 'Urgent' })
      )
    ),
  },
  'section-width': {
    config: { sectionWidth: 300 },
    input: board(
      column(
        'todo',
        'Todo',
        card('a', 'A card title long enough to wrap at the default width of 200 but not at 300')
      ),
      column('done', 'Done', card('b', 'Short card'))
    ),
  },
  'shape-data-multi-line': {
    input: board(
      column(
        'todo',
        'Todo',
        card('a', 'Card', { ticket: 'MC-1', assigned: 'knsv', priority: 'High' }),
        card('b', 'Label from metadata'),
        card('c', 'Quoted values', { assigned: 'K. Sveidqvist', ticket: 'MC-2' }),
        card('d', 'A label in quotes<br/>over two lines')
      )
    ),
  },
  'strings-and-markdown': {
    input: board(
      column(
        'a',
        'Column with [brackets] and (parens)',
        card('b', '`**Bold** and _italic_ markdown`'),
        card('c', 'A quoted label\nwith a line break'),
        card('d', 'Label with a<br>break tag'),
        card('e', 'Entity ♥ and "quotes"')
      )
    ),
  },
  'empty board': { input: board() },
  'empty column': { input: board(column('todo', 'Todo'), column('done', 'Done', card('a'))) },
  'sectionWidth 0': {
    config: { sectionWidth: 0 },
    input: board(column('todo', 'Todo', card('a', 'Card'))),
  },
  'a column title taller than the title row': {
    input: board(
      column('a', 'A column title long enough to wrap onto two lines at least', card('x')),
      column('b', 'Short', card('y')),
      column('c', 'Empty')
    ),
  },
  'a word wider than the column': {
    input: board(
      column(
        'a',
        'Supercalifragilisticexpialidocious-and-then-some',
        card('x', 'Pneumonoultramicroscopicsilicovolcanoconiosis')
      )
    ),
  },
  'a ticket and an assignee on several lines': {
    input: board(
      column(
        'a',
        'Todo',
        card('x', 'Card', { ticket: 'MC-1<br>MC-2<br>MC-3', assigned: 'a very long assignee name' })
      )
    ),
  },
};
