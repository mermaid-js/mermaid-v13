import { describe, expect, it } from 'vitest';
import { kanbanLanguage, language } from './language.ts';

/**
 * The kanban language facet (#463) at its own seam: the parse the service reads, completions at
 * a probe parse and `isValidId`, as the language service calls them. The service-level
 * behaviour (definition, references, rename, folding, semantic tokens, hover) is in the goldens
 * (`packages/language-service/goldens/kanban`).
 */
const CURSOR = '¦';

function split(marked: string): [text: string, at: number] {
  const at = marked.indexOf(CURSOR);
  return [marked.slice(0, at) + marked.slice(at + 1), at];
}

/** Completion labels at `¦`. */
function complete(marked: string): string[] {
  const [text, at] = split(marked);
  const result = kanbanLanguage.parse(text, { keepTokens: true, probe: at });
  return kanbanLanguage.completions(result.probe!, { text, result }).map((c) => c.label);
}

/** Each symbol as `<kind> <role> <name> = <text at its range>`. */
function symbols(text: string): string[] {
  const r = kanbanLanguage.parse(text, { keepTokens: true });
  return r.symbols.map(
    (s) => `${s.kind} ${s.role} ${s.name} = ${text.slice(s.range.start, s.range.end)}`
  );
}

describe('the kanban facet', () => {
  it('is exported under the name the service imports', () => {
    expect(language).toBe(kanbanLanguage);
    expect(language.id).toBe('kanban');
    expect(language.standalone).toEqual(['node']);
  });

  it('records ids, classes and assignees, an assignee in place whether quoted or in a block', () => {
    const text =
      'kanban\n  todo\n    a[Card]@{ assigned: knsv }\n    :::hot big\n    b@{\n      assigned: "knsv"\n    }\n    [no id]';
    expect(symbols(text)).toEqual([
      'node def todo = todo',
      'node def a = a',
      'assignee def knsv = knsv',
      'class ref hot = hot',
      'class ref big = big',
      'node def b = b',
      'assignee ref knsv = "knsv"',
    ]);
  });

  it('gives the data block as the range of an assignee it cannot place (the service drops it)', () => {
    // A `#` in data is read from v12's wrapped text, not in place.
    const text = 'kanban\n  todo\n    a@{ assigned: knsv, ticket: "#35;1" }';
    expect(symbols(text).at(-1)).toBe('assignee def knsv = @{ assigned: knsv, ticket: "#35;1" }');
  });

  it('records no assignee v12 does not keep (a falsy value)', () => {
    expect(symbols('kanban\n  todo\n    a@{ assigned: 0 }\n    b@{ assigned: null }')).toEqual([
      'node def todo = todo',
      'node def a = a',
      'node def b = b',
    ]);
  });

  it('completes keys the block lacks, priorities and assignees', () => {
    expect(complete('kanban\n  todo\n    a@{ ticket: T-1, ¦ }')).toEqual([
      'assigned',
      'priority',
      'label',
      'icon',
      'shape',
    ]);
    expect(complete('kanban\n  todo\n    a@{ priority: ¦ }')).toEqual([
      'Very High',
      'High',
      'Low',
      'Very Low',
    ]);
    expect(complete('kanban\n  todo\n    a@{ assigned: bob }\n    b@{ assigned: ¦ }')).toEqual([
      'bob',
    ]);
    // A value no other key takes, and a quoted run: nothing.
    expect(complete('kanban\n  todo\n    a@{ ticket: ¦ }')).toEqual([]);
    expect(complete('kanban\n  todo\n    a@{ priority: "¦" }')).toEqual([]);
  });

  it('offers no assignee that would not read back bare', () => {
    expect(complete('kanban\n  todo\n    a@{ assigned: "x, y" }\n    b@{ assigned: ¦ }')).toEqual(
      []
    );
  });

  it('completes nothing on a line v12 rejects, and goes on after it', () => {
    // A blank line right after `kanban` is an error at the item after it.
    expect(complete('kanban\n\n  ¦todo\n    a')).toEqual([]);
    expect(complete('kanban\n\n  todo\n    ¦')).toEqual(['::icon()', ':::']);
  });
});

describe('kanban isValidId', () => {
  const valid = (name: string, kind?: string) => kanbanLanguage.isValidId(name, kind);

  it('takes an item id that reads back as one', () => {
    expect(valid('a b:c')).toBeUndefined();
    expect(valid('id]x')).toBeUndefined();
    expect(valid('')).toMatch(/empty/);
    expect(valid(' a')).toMatch(/blank/);
    expect(valid('a[b]')).toMatch(/shape/);
    expect(valid('a@b')).toMatch(/shape/);
    // `kanban` at the start of a line is the header keyword, whatever its case.
    expect(valid('Kanban board')).toMatch(/would not read/);
    expect(valid(':::x')).toMatch(/would not read/);
  });

  it('takes a class name without blanks', () => {
    expect(valid('urgent', 'class')).toBeUndefined();
    expect(valid('a b', 'class')).toMatch(/two classes/);
  });

  it('takes an assignee that reads back on one line and in a block', () => {
    expect(valid('Knut S', 'assignee')).toBeUndefined();
    expect(valid('42', 'assignee')).toBeUndefined();
    expect(valid('a, b', 'assignee')).toMatch(/would not read/);
    expect(valid('a: b', 'assignee')).toMatch(/would not read/);
    expect(valid('#x', 'assignee')).toMatch(/would not read/);
    expect(valid('"x"', 'assignee')).toMatch(/would not read/);
    expect(valid('null', 'assignee')).toMatch(/would not read/);
    expect(valid('x\ny', 'assignee')).toMatch(/line break/);
  });

  it('names a kind it does not have', () => {
    expect(valid('a', 'edge')).toMatch(/not a kanban symbol kind/);
  });
});
