import { describe, expect, it } from 'vitest';
import { parseTimeline, TimelineTokenKind } from '../index.ts';

const errors = (src: string) =>
  parseTimeline(src)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.code);

describe('parseTimeline: model', () => {
  it('reads periods, events and sections in source order, text as v12 kept it', () => {
    const { model, diagnostics } = parseTimeline(
      'timeline\n  title History\n  2002 : LinkedIn\n  section Web 2\n  2004 : Facebook : Google\n       : MySpace\n'
    );
    expect(diagnostics).toEqual([]);
    expect(model).toEqual({
      direction: 'LR',
      title: 'History',
      accTitle: '',
      accDescr: '',
      sections: [{ ast: 'sec:1', text: 'Web 2' }],
      periods: [
        { ast: 'per:1', text: '2002 ', events: [{ ast: 'ev:1.1', text: 'LinkedIn' }] },
        {
          ast: 'per:2',
          text: '2004 ',
          section: 0,
          events: [
            { ast: 'ev:2.1', text: 'Facebook ' },
            { ast: 'ev:2.2', text: 'Google' },
            { ast: 'ev:2.3', text: 'MySpace' },
          ],
        },
      ],
      warnings: [],
    });
  });

  it('reads the direction from the header', () => {
    expect(parseTimeline('timeline TD\n2002 : x').model.direction).toBe('TD');
    expect(parseTimeline('timeline LR\n2002 : x').model.direction).toBe('LR');
    expect(parseTimeline('timeline\n2002 : x').model.direction).toBe('LR');
  });

  it('keeps every section, repeated names included, and periods before the first one', () => {
    const { model } = parseTimeline('timeline\n0 : a\nsection A\n1\nsection A\n2 : b');
    expect(model.sections.map((s) => [s.ast, s.text])).toEqual([
      ['sec:1', 'A'],
      ['sec:2', 'A'],
    ]);
    expect(model.periods.map((p) => p.section)).toEqual([undefined, 0, 1]);
  });

  it('attaches an event to the last period, across sections and other statements', () => {
    const { model } = parseTimeline('timeline\n2002 : a\nsection S\ntitle T\n: b');
    expect(model.periods[0]?.events.map((e) => e.text)).toEqual(['a', 'b']);
  });

  it('takes the last title and accessibility values, trimmed as v12 stored them', () => {
    const { model } = parseTimeline(
      'timeline\ntitle one\ntitle two \naccTitle:  A t \naccDescr {\n  line one\n    line two\n}\n2002 : x'
    );
    expect(model.title).toBe('two ');
    expect(model.accTitle).toBe('A t');
    expect(model.accDescr).toBe('line one\nline two');
  });

  it('uses the front-matter title when the text has none (D218)', () => {
    const src = '---\ntitle: From front matter\n---\ntimeline\n2002 : x';
    expect(parseTimeline(src).model.title).toBe('From front matter');
    expect(parseTimeline(src.replace('2002', 'title In text\n2002')).model.title).toBe('In text');
  });

  it('keeps `#`, `;` and entities as text, and a `#` comment after a period', () => {
    const { model } = parseTimeline(
      'timeline\ntitle #my#title# ;x;\nsection #a#b ;c\n2002 #c\n2003 : #e#v ; : #lt;b#gt;'
    );
    expect(model.title).toBe('#my#title# ;x;');
    expect(model.sections[0]?.text).toBe('#a#b ;c');
    expect(model.periods.map((p) => p.text)).toEqual(['2002 ', '2003 ']);
    expect(model.periods[1]?.events.map((e) => e.text)).toEqual(['#e#v ; ', '&lt;b&gt;']);
  });
});

describe('parseTimeline: errors', () => {
  it('accepts an empty body', () => {
    expect(errors('timeline')).toEqual([]);
    expect(errors('timeline\n  \n')).toEqual([]);
  });

  it('rejects an event before any period, as v12 did (a TypeError there)', () => {
    const { diagnostics } = parseTimeline('timeline\n: x\n2002 : y');
    expect(diagnostics.map((d) => [d.code, d.message])).toEqual([
      [
        'TIMELINE_EVENT_BEFORE_PERIOD',
        'An event needs a time period before it: write it as `<period> : <event>`, e.g. `2002 : LinkedIn`.',
      ],
    ]);
  });

  it('rejects a `:` that starts no event, such as a trailing `2002 : `', () => {
    expect(errors('timeline\n2002 : ')).toEqual(['UNEXPECTED']);
    expect(errors('timeline\n2002 :x')).toEqual(['UNEXPECTED']);
  });

  it('rejects `timeline` after the header, and a missing header', () => {
    expect(errors('timeline\ntimeline : x')).toEqual(['UNEXPECTED']);
    expect(errors('2002 : x')).toEqual(['UNEXPECTED']);
  });

  it('rejects an unclosed `accDescr {` and an empty accessibility value at the very end', () => {
    expect(errors('timeline\naccDescr {\nnever closed')).toEqual(['UNCLOSED_DESCRIPTION']);
    expect(errors('timeline\naccTitle: ')).toEqual(['UNEXPECTED']);
    expect(errors('timeline\naccDescr:')).toEqual(['UNEXPECTED']);
    expect(errors('timeline\naccTitle: x')).toEqual([]);
  });
});

describe('parseTimeline: error messages', () => {
  it('quotes one line of what it found, at `accDescr {` for a description', () => {
    const src = 'accDescr {\n a\n b\n}\ntimeline';
    const [d] = parseTimeline(src).diagnostics;
    expect(d?.message).toBe(
      'Expected `timeline`, got `accDescr {`; a timeline starts with `timeline`, `timeline LR` or `timeline TD`.'
    );
    expect(d && src.slice(d.range.start, d.range.end)).toBe('accDescr {');
    const title = parseTimeline('title\nfoo\ntimeline').diagnostics[0]?.message;
    expect(title).toMatch(/got `title…`/);
  });
});

describe('parseTimeline: AST', () => {
  it('gives every statement a semantic id and its source range', () => {
    const src = 'timeline\ntitle T\nsection S\n2002 : a : b\naccTitle: x\n';
    const { ast, statements } = parseTimeline(src);
    expect(ast.children.map((n) => [n.type, n.id, src.slice(n.range.start, n.range.end)])).toEqual([
      ['Header', 'st:1', 'timeline'],
      ['Title', 'st:2', 'title T'],
      ['Section', 'sec:1', 'section S'],
      ['Period', 'per:1', '2002 '],
      ['Event', 'ev:1.1', ': a '],
      ['Event', 'ev:1.2', ': b'],
      ['AccTitle', 'st:3', 'accTitle: x'],
    ]);
    expect(statements.map((s) => s.kind)).toEqual(['header', 'title', 'section']);
    expect(statements[2]?.children?.map((s) => s.kind)).toEqual([
      'period',
      'event',
      'event',
      'accTitle',
    ]);
  });

  it('spans each section from `section` to the last line before the next (folding, D259)', () => {
    const src =
      'timeline\n  2001 : a\n  section A\n    2002 : b\n         : c\n    %% note\n\n  section B\n  section C\n    title T\n    2003 : d\n\n';
    const { statements } = parseTimeline(src);
    const spans = statements.map((s) => [s.kind, src.slice(s.range.start, s.range.end)]);
    expect(spans).toEqual([
      ['header', 'timeline'],
      ['period', '2001 '],
      ['event', ': a'],
      ['section', 'section A\n    2002 : b\n         : c\n    %% note\n\n'],
      ['section', 'section B\n'],
      ['section', 'section C\n    title T\n    2003 : d\n\n'],
    ]);
    expect(statements[3]?.children?.map((s) => s.kind)).toEqual(['period', 'event', 'event']);
    expect(statements[4]?.children).toBeUndefined();
    expect(statements[5]?.children?.map((s) => s.kind)).toEqual(['title', 'period', 'event']);
  });

  it('gives an empty `accDescr {}` a statement, and leaves the description as it was', () => {
    for (const body of ['{}', '{   }', '{\n}']) {
      const src = `timeline\naccDescr: d\naccDescr ${body}\n`;
      const { ast, statements, model, diagnostics } = parseTimeline(src);
      expect(diagnostics).toEqual([]);
      const node = ast.children[2];
      expect(node && [node.type, node.id, src.slice(node.range.start, node.range.end)]).toEqual([
        'AccDescr',
        'st:3',
        `accDescr ${body}`,
      ]);
      expect(statements.map((s) => s.kind)).toEqual(['header', 'accDescr', 'accDescr']);
      expect(model.accDescr).toBe('d');
    }
  });

  it('takes `accDescr {` and `}` into the description statement', () => {
    const src = 'timeline\naccDescr {\n  d\n}\n';
    const node = parseTimeline(src).ast.children[1];
    expect(node && src.slice(node.range.start, node.range.end)).toBe('accDescr {\n  d\n}');
  });
});

describe('parseTimeline: probe (R-LANG-7, D95)', () => {
  const K = TimelineTokenKind;
  const STATEMENT = [
    K.Period,
    K.Event,
    K.Section,
    K.Title,
    K.AccTitle,
    K.AccDescr,
    K.AccDescrMultiline,
  ];
  const HEADERS = [K.Timeline, K.TimelineLR, K.TimelineTD];
  const probe = (marked: string) => {
    const at = marked.indexOf('¦');
    const src = marked.slice(0, at) + marked.slice(at + 1);
    const p = parseTimeline(src, { probe: at }).probe!;
    return { expected: p.expected, mode: p.mode, prefix: src.slice(p.prefix.start, p.prefix.end) };
  };

  it('expects the header at the start, a direction after `timeline`', () => {
    expect(probe('¦')).toEqual({ expected: HEADERS, mode: 'INITIAL', prefix: '' });
    expect(probe('time¦')).toMatchObject({ expected: HEADERS, prefix: 'time' });
    expect(probe('timeline ¦').expected).toEqual([K.TimelineLR, K.TimelineTD, ...STATEMENT]);
    expect(probe('timeline L¦')).toMatchObject({
      expected: [K.TimelineLR, K.TimelineTD, ...STATEMENT],
      prefix: 'L',
    });
    expect(probe('timeline TD\n¦').expected).toEqual(STATEMENT);
  });

  it('expects a statement at a line start, after any statement', () => {
    expect(probe('timeline\n  ¦')).toMatchObject({ expected: STATEMENT, prefix: '' });
    expect(probe('timeline\n  sec¦')).toMatchObject({ expected: STATEMENT, prefix: 'sec' });
    expect(probe('timeline\n  2002 : a\n  ¦\n  2003 : b').expected).toEqual(STATEMENT);
  });

  it('names the lexer mode: inside an accessibility value nothing is code', () => {
    expect(probe('timeline\n  accTitle: a¦').mode).toBe('acc_title');
    expect(probe('timeline\n  accDescr: ¦').mode).toBe('acc_descr');
    expect(probe('timeline\n  accDescr {\n  ¦\n}').mode).toBe('acc_descr_multiline');
    expect(probe('timeline\n  accDescr {¦\n}').mode).toBe('acc_descr_multiline');
    // The blanks after `:` are the value's: typing there writes the value.
    expect(probe('timeline\n  accTitle: ¦ x').mode).toBe('acc_title');
    expect(probe('timeline\n  accTitle:¦ x').mode).toBe('acc_title');
    expect(probe('timeline\n  accTi¦tle: x').mode).toBe('INITIAL');
    expect(probe('timeline\n  %% a ¦comment\n').mode).toBe('comment');
    expect(probe('---\ntitle: ¦x\n---\ntimeline\n').mode).toBe('frontMatter');
  });

  it('changes nothing else', () => {
    const src = 'timeline\n  section A\n  2002 : a\n  bad : : x\n  accDescr {\n';
    const { probe: _, ...plain } = parseTimeline(src, { keepTokens: true });
    for (let at = 0; at <= src.length; at++) {
      const { probe: p, ...withProbe } = parseTimeline(src, { keepTokens: true, probe: at });
      expect(withProbe).toEqual(plain);
      expect(p?.offset).toBe(at);
    }
  });
});
