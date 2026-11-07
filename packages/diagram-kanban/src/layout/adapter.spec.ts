// cspell:words knsv
import { describe, expect, it } from 'vitest';
import { kanban, parsed } from './fixtures.ts';

const input = (...lines: string[]) => parsed(kanban(...lines)).input;

describe('kanbanLayoutInput (KanbanModel → layout input)', () => {
  it('lists columns in order, each with its own cards by position (D373)', () => {
    const { columns } = input(
      '  docs[A]',
      '    x[One]',
      '  docs[B]',
      '    y[Two]',
      '      z[Deep]'
    );
    expect(columns.map((c) => [c.ast, c.title, c.cards.map((k) => k.ast)])).toEqual([
      ['n:docs', 'A', ['n:x']],
      ['n:docs@2', 'B', ['n:y', 'n:z']],
    ]);
  });

  it('takes a misplaced (shallower) item as a card of the last column, as the model does', () => {
    const { columns } = input('    Todo', '      a[Card]', '    Done', '  c[Shallow]');
    expect(columns.map((c) => c.cards.map((k) => k.title))).toEqual([['Card'], ['Shallow']]);
  });

  it('passes the label, ticket and assignee as strings, and `label:` over the text', () => {
    const [card] = input(
      '  a[A]',
      "    x[Text]@{ label: 'From data', ticket: 103, assigned: knsv, priority: 'High' }"
    ).columns[0]!.cards;
    expect(card).toEqual({
      ast: 'n:x',
      title: 'From data',
      ticket: '103',
      assigned: 'knsv',
      priority: 'High',
    });
  });

  it('passes no priority that was not a YAML string (D375)', () => {
    const cards = input(
      '  a[A]',
      '    x@{ priority: 1 }',
      '    y@{ priority: [High] }',
      "    z@{ priority: 'Low' }"
    ).columns[0]!.cards;
    expect(cards.map((c) => c.priority)).toEqual([undefined, undefined, 'Low']);
  });

  it('keeps labels as the parser gives them, for the label layout to decode', () => {
    const [card] = input('  a[A]', '    x[Entity #9829; and a<br>break]').columns[0]!.cards;
    // The model's label: the entity as `&#9829;`, which core's label layout decodes.
    expect(card!.title).toBe('Entity &#9829; and a<br>break');
  });

  it('gives an empty board no columns', () => {
    expect(input('')).toEqual({ columns: [] });
  });
});
