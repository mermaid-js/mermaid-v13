import { describe, expect, it } from 'vitest';
import { language, requirementLanguage } from './language.ts';

const CURSOR = '¦';

/** `marked` with `¦` as the cursor: the facet's completion labels there. */
function complete(marked: string): string[] {
  const at = marked.indexOf(CURSOR);
  const text = marked.slice(0, at) + marked.slice(at + 1);
  const result = requirementLanguage.parse(text, { keepTokens: true, probe: at });
  return requirementLanguage.completions(result.probe!, { text, result }).map((c) => c.label);
}

function hover(marked: string): string | undefined {
  const at = marked.indexOf(CURSOR);
  const text = marked.slice(0, at) + marked.slice(at + 1);
  const result = requirementLanguage.parse(text, { keepTokens: true });
  const symbol = result.symbols.find((s) => s.range.start <= at && at <= s.range.end);
  const tokens = result.tokens!;
  let token: { kind: number; range: { start: number; end: number } } | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const start = tokens.start[i]!;
    const end = tokens.end[i]!;
    if (start <= at && at < end) token = { kind: tokens.kind[i]!, range: { start, end } };
  }
  return requirementLanguage.hover({ offset: at, token, symbol }, { text, result })?.contents;
}

const symbols = (text: string) =>
  requirementLanguage
    .parse(text, { keepTokens: true })
    .symbols.map((s) => `${s.role} ${s.kind}:${s.name} ${text.slice(s.range.start, s.range.end)}`);

describe('requirement language facet: symbols (D437)', () => {
  it('is the requirement facet, exported under the fixed name `language`', () => {
    expect(requirementLanguage.id).toBe('requirement');
    expect(language).toBe(requirementLanguage);
    expect(requirementLanguage.namespaces).toEqual([['requirement', 'element'], ['class']]);
  });

  it('defines a name at its box and refers to it from relations, styles and classes', () => {
    const text = [
      'requirementDiagram',
      'requirement r1 {',
      '  id: 1',
      '}',
      'element "e one" {',
      '  type: sim',
      '}',
      'classDef hot,cold fill:#f96',
      '"e one" - satisfies -> r1',
      'r1 <- traces - "e one"',
      'style r1 fill:#f00',
      'class r1,"e one" hot',
      'r1:::cold',
      '',
    ].join('\n');
    expect(symbols(text)).toEqual([
      'def requirement:r1 r1',
      'def element:e one "e one"',
      'def class:hot hot',
      'def class:cold cold',
      'ref element:e one "e one"',
      'ref requirement:r1 r1',
      'ref requirement:r1 r1',
      'ref element:e one "e one"',
      'ref requirement:r1 r1',
      'ref requirement:r1 r1',
      'ref element:e one "e one"',
      'ref class:hot hot',
      'ref requirement:r1 r1',
      'ref class:cold cold',
    ]);
  });

  it('makes a later box of a defined name, and a later classDef, references', () => {
    const text = [
      'requirementDiagram',
      'requirement a {',
      '}',
      'element a {',
      '}',
      'element b:::c {',
      '}',
      'classDef c fill:#f00',
      'classDef c stroke:#000',
      'x - contains -> b',
      '',
    ].join('\n');
    expect(symbols(text)).toEqual([
      'def requirement:a a',
      'ref element:a a',
      'def element:b b',
      'ref class:c c',
      'def class:c c',
      'ref class:c c',
      'ref requirement:x x',
      'ref element:b b',
    ]);
  });
});

describe('requirement language facet: names (rename, D437)', () => {
  const { isValidId, quoteId } = requirementLanguage;

  it.each(['r1', 'R_2', 'test1', 'idx', 'riskLevel', '1', 'a_b'])('accepts %s bare', (name) => {
    expect(isValidId(name)).toBeUndefined();
    expect(isValidId(name, 'element')).toBeUndefined();
    expect(isValidId(name, 'class')).toBeUndefined();
  });

  it.each([
    ['', /empty/],
    ['a\nb', /line break/],
    ['test', /keyword/],
    ['Requirement', /keyword/],
    ['high', /keyword/],
    ['style', /keyword/],
    ['requirementDiagram', /keyword/],
    ['title', /keyword/],
    ['my req', /quotes/],
    ['a.b', /quotes/],
    ['café', /quotes/],
    ['-a', /quotes/],
  ])('refuses %j bare', (name, why) => {
    expect(isValidId(name)).toMatch(why);
  });

  it('refuses a class name a style statement cannot hold bare', () => {
    expect(isValidId('hot', 'class')).toBeUndefined();
    expect(isValidId('very hot', 'class')).toMatch(/quotes/);
    expect(isValidId('contains', 'class')).toMatch(/keyword/);
    expect(isValidId('default', 'class')).toMatch(/every box/);
    expect(quoteId?.('default', 'class')).toBeUndefined();
  });

  it('records no symbol for the class `default`, which every box has', () => {
    const text = 'requirementDiagram\nclassDef default fill:#f00\nrequirement a:::default {\n}\n';
    expect(symbols(text)).toEqual(['def requirement:a a']);
  });

  it.each([
    ['my req', '"my req"'],
    ['test', '"test"'],
    ['a.b', '"a.b"'],
    ['café', '"café"'],
  ])('quotes %j as %s', (name, quoted) => {
    expect(quoteId?.(name)).toBe(quoted);
    expect(quoteId?.(name, 'class')).toBe(quoted);
  });

  it.each(['', 'a"b', 'a\nb'])('cannot quote %j', (name) => {
    expect(quoteId?.(name)).toBeUndefined();
  });
});

describe('requirement language facet: completions (D95)', () => {
  const doc = (...lines: string[]) =>
    [
      'requirementDiagram',
      'requirement r1 {',
      '}',
      'element e1 {',
      '}',
      'classDef hot fill:#f96',
      ...lines,
    ].join('\n');

  it('offers the kinds, element, the statements and the known names at a line start', () => {
    expect(complete(doc('¦'))).toEqual([
      'requirement',
      'functionalRequirement',
      'interfaceRequirement',
      'performanceRequirement',
      'physicalRequirement',
      'designConstraint',
      'element',
      'style',
      'classDef',
      'class',
      'direction TB',
      'direction BT',
      'direction LR',
      'direction RL',
      'accTitle',
      'accDescr',
      'r1',
      'e1',
    ]);
    expect(complete(doc('fun¦'))).toEqual(['functionalRequirement']);
  });

  it('offers the fields of a body', () => {
    expect(complete('requirementDiagram\nrequirement a {\n  ¦\n}\n')).toEqual([
      'id',
      'text',
      'risk',
      'verifymethod',
    ]);
    expect(complete('requirementDiagram\nelement a {\n  ty¦\n}\n')).toEqual(['type']);
  });

  it('offers the risks after `risk:` and the methods after `verifymethod:`', () => {
    expect(complete('requirementDiagram\nrequirement a {\n  risk: ¦\n}\n')).toEqual([
      'low',
      'medium',
      'high',
    ]);
    expect(complete('requirementDiagram\nrequirement a {\n  verifymethod: ¦\n}\n')).toEqual([
      'analysis',
      'demonstration',
      'inspection',
      'test',
    ]);
    expect(complete('requirementDiagram\nrequirement a {\n  text: ¦\n}\n')).toEqual([]);
  });

  it('offers the relationships after `-` and the names at both ends', () => {
    expect(complete(doc('r1 - ¦'))).toEqual([
      'contains',
      'copies',
      'derives',
      'satisfies',
      'verifies',
      'refines',
      'traces',
    ]);
    expect(complete(doc('e1 - satisfies -> ¦'))).toEqual(['r1', 'e1']);
    expect(complete(doc('r1 <- satisfies - ¦'))).toEqual(['r1', 'e1']);
    expect(complete(doc('requirement ¦'))).toEqual([]);
  });

  it('offers the class names after `:::` and `class`, the names before them', () => {
    expect(complete(doc('r1:::¦'))).toEqual(['hot']);
    expect(complete(doc('class r1 ¦'))).toEqual(['hot']);
    expect(complete(doc('class ¦'))).toEqual(['r1', 'e1']);
    expect(complete(doc('style ¦'))).toEqual(['r1', 'e1']);
    expect(complete(doc('style r1 ¦'))).toEqual([]);
  });

  it('offers nothing in a value or a comment', () => {
    expect(complete(doc('accTitle: ¦'))).toEqual([]);
    expect(complete(doc('accDescr {\n  ¦\n  text\n}'))).toEqual([]);
    expect(complete(doc('accDescr {   ¦'))).toEqual([]);
    expect(complete(doc('%% ¦'))).toEqual([]);
  });
});

describe('requirement language facet: hover (D93)', () => {
  const text = [
    'requirementDiagram',
    'functionalRequirement "test req" {',
    '  id: 1.2',
    '  text: the test text.',
    '  risk: high',
    '  verifymethod: test',
    '}',
    'element sim {',
    '  type: simulation',
    '  docref: reqs/sim',
    '}',
    'classDef hot fill:#f96,stroke:#333',
    'sim - satisfies -> "test req"',
    'sim:::hot',
    '',
  ];
  const at = (line: number, find: string, offset = 1) => {
    const lines = [...text];
    const i = lines[line]!.indexOf(find) + offset;
    lines[line] = lines[line]!.slice(0, i) + CURSOR + lines[line]!.slice(i);
    return lines.join('\n');
  };

  it("shows a requirement's kind, fields, relations and classes", () => {
    expect(hover(at(1, '"test'))).toBe(
      [
        '**Functional Requirement** `test req`',
        'id: `1.2` · text: `the test text.` · risk: `High` · verifymethod: `Test`',
        '1 relation',
      ].join('\n\n')
    );
  });

  it("shows an element's fields, from any of its occurrences", () => {
    const want = [
      '**Element** `sim`',
      'type: `simulation` · docref: `reqs/sim`',
      '1 relation · Class: `hot`',
    ].join('\n\n');
    expect(hover(at(7, 'sim'))).toBe(want);
    expect(hover(at(13, 'sim'))).toBe(want);
  });

  it("shows a class's styles", () => {
    expect(hover(at(13, 'hot'))).toBe(
      '**class** `hot`\n\n`classDef hot fill:#f96,stroke:#333`\n\nUsed by 1 box'
    );
  });

  it('says what a relationship means, and the keyword docs', () => {
    expect(hover(at(12, 'satisfies'))).toMatch(
      /^\*\*`satisfies`\*\* `sim` satisfies `test req`\n\n`a - satisfies -> b`/
    );
    expect(hover(at(7, 'element'))).toMatch(/^\*\*`element`\*\*\n\n`element name \{/);
    expect(hover(at(4, 'risk'))).toMatch(/^\*\*`risk`\*\*\n\n`id: …`/);
  });
});
