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
    expect(complete('kanban\n\n  todo\n    ¦')).toEqual([
      '::icon()',
      ':::',
      'accTitle',
      'accDescr',
    ]);
  });

  it('completes `accTitle` and `accDescr` at a statement start, before any item too (D742)', () => {
    expect(complete('kanban\n  acc¦')).toEqual(['accTitle', 'accDescr']);
    expect(complete('kanban\n  todo\n  acc¦')).toEqual(['accTitle', 'accDescr']);
    expect(complete('kanban\n  todo\n    accD¦')).toEqual(['accDescr']);
    // Not after an item on its line, nor in an acc statement's text.
    expect(complete('kanban\n  todo[x] acc¦')).toEqual([]);
    expect(complete('kanban\n  accTitle: a¦')).toEqual([]);
  });

  it('hovers the keyword of an acc statement with its doc, and records no symbol for it', () => {
    const text = 'kanban\n  accTitle: My board\n  accDescr {\n    d\n  }\n  todo';
    const result = kanbanLanguage.parse(text, { keepTokens: true });
    const hoverAt = (offset: number) => {
      const t = result.tokens!;
      let j = 0;
      while ((t.end[j] ?? 0) <= offset) j++;
      const token = { kind: t.kind[j] ?? 0, range: { start: t.start[j] ?? 0, end: t.end[j] ?? 0 } };
      return kanbanLanguage.hover({ offset, token }, { text, result });
    };
    const hover = hoverAt(text.indexOf('Title'));
    expect(hover?.contents).toMatch(/^\*\*`accTitle`\*\*\n\n`accTitle: …`: the accessible title/);
    expect(hover?.range).toEqual({ start: 9, end: 17 });
    expect(hoverAt(text.indexOf('Descr'))?.contents).toMatch(/^\*\*`accDescr`\*\*/);
    // Not on the value, nor anywhere in the block.
    expect(hoverAt(text.indexOf('board'))).toBeUndefined();
    expect(hoverAt(text.indexOf('d\n  }'))).toBeUndefined();
    expect(symbols(text)).toEqual(['node def todo = todo']);
  });
});

/** The source range of each assignee occurrence of `text`. */
function assignees(text: string): [name: string, start: number, end: number][] {
  const r = kanbanLanguage.parse(text, { keepTokens: true });
  return r.symbols
    .filter((s) => s.kind === 'assignee')
    .map((s) => [s.name, s.range.start, s.range.end]);
}

/** `[name, start, end]` of the last `written` in `text`, the value the YAML pair holds. */
function last(text: string, written: string, name = written): [string, number, number] {
  const at = text.lastIndexOf(written);
  return [name, at, at + written.length];
}

describe('kanban assignee ranges are the `assigned` value', () => {
  it('in a pair whose text an earlier value repeats (one line, a quoted key)', () => {
    const text = `kanban\n  todo\n    a@{ label: 'x, assigned: bob, y', "assigned": bob }`;
    expect(assignees(text)).toEqual([last(text, 'bob')]);
  });

  it('in a pair a multi-line quoted value before it repeats (block data)', () => {
    const text = `kanban\n  todo\n    a@{\n      label: 'q\n        assigned: bob\n        '\n      "assigned": bob\n    }`;
    expect(assignees(text)).toEqual([last(text, 'bob')]);
  });

  it('quoted, with the quotes', () => {
    const text = `kanban\n  todo\n    a@{ assigned: 'knsv' }\n    b@{\n      assigned: "knsv"\n    }`;
    const one = text.indexOf("'knsv'");
    expect(assignees(text)).toEqual([['knsv', one, one + 6], last(text, '"knsv"', 'knsv')]);
  });

  it('none for a repeated key: the data is bad YAML', () => {
    expect(assignees('kanban\n  todo\n    a@{ assigned: a, assigned: b }')).toEqual([]);
  });

  it('read from v12 text: CRLF and CR line breaks, a `#` in a quoted value, a comment', () => {
    for (const text of [
      'kanban\r\n  todo\r\n    a@{\r\n      assigned: knsv\r\n    }\r\n',
      'kanban\r  todo\r    a@{\r      ticket: x\r      assigned: knsv\r    }\r',
      'kanban\n  todo\n    a@{ ticket: "#1", assigned: knsv }',
      'kanban\n  todo\n    a@{ assigned: knsv # who }',
      'kanban\n  todo\n    a@{\n      assigned: knsv # who\n    }',
      'kanban\n  todo\n    a@{ assigned: knsv, %%{init: {}}%% ticket: x }',
    ]) {
      expect(assignees(text), JSON.stringify(text)).toEqual([last(text, 'knsv')]);
    }
  });

  it('the data block (dropped by the service) where the value cannot be placed in the source', () => {
    // An entity anywhere in the data (v12 read placeholders), and a block scalar, whose range
    // holds its indicator.
    const entity = 'kanban\n  todo\n    a@{ assigned: knsv, ticket: "#35;1" }';
    const data = entity.indexOf('@{');
    expect(assignees(entity)).toEqual([['knsv', data, entity.length]]);
    const folded = 'kanban\n  todo\n    a@{\n      assigned: >-\n        knsv\n    }';
    expect(assignees(folded)).toEqual([['knsv', folded.indexOf('>-'), last(folded, 'knsv')[2]]]);
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
