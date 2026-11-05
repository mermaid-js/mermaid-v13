import { describe, expect, it } from 'vitest';
import { language, quadrantLanguage } from './language.ts';

const CURSOR = '¦';
const H = 'quadrantChart\n';

function split(marked: string): [text: string, at: number] {
  const at = marked.indexOf(CURSOR);
  return [marked.slice(0, at) + marked.slice(at + 1), at];
}

/** `text` with `¦` as the cursor: the probe parse and the facet's completion labels there. */
function complete(marked: string): string[] {
  const [text, at] = split(marked);
  const result = quadrantLanguage.parse(text, { keepTokens: true, probe: at });
  return quadrantLanguage.completions(result.probe!, { text, result }).map((c) => c.label);
}

function hover(marked: string): string | undefined {
  const [text, at] = split(marked);
  const result = quadrantLanguage.parse(text, { keepTokens: true });
  const symbol = result.symbols.find((s) => s.range.start <= at && at <= s.range.end);
  const tokens = result.tokens!;
  let token: { kind: number; range: { start: number; end: number } } | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const start = tokens.start[i]!;
    const end = tokens.end[i]!;
    if (start <= at && at < end) token = { kind: tokens.kind[i]!, range: { start, end } };
  }
  return quadrantLanguage.hover({ offset: at, token, symbol }, { text, result })?.contents;
}

const STATEMENT_KEYWORDS = [
  'title',
  'x-axis',
  'y-axis',
  'quadrant-1',
  'quadrant-2',
  'quadrant-3',
  'quadrant-4',
  'classDef',
  'accTitle',
  'accDescr',
  'accDescr {',
];
const STYLE_KEYS = ['radius', 'color', 'stroke-color', 'stroke-width'];

describe('quadrant language facet: parse, categories, namespaces', () => {
  const text = `${H}  classDef hot radius: 10\n  A:::hot: [0.3, 0.6]\n  B: [0.5, 0.5]\n`;

  it('is the quadrantChart facet, exported under the fixed name `language`', () => {
    expect(quadrantLanguage.id).toBe('quadrantChart');
    expect(language).toBe(quadrantLanguage);
  });

  it('parses with the token stream kept; classes are the only symbols', () => {
    const result = quadrantLanguage.parse(text, { keepTokens: true });
    expect(result.diagnostics).toEqual([]);
    expect(result.tokens?.length).toBeGreaterThan(0);
    expect(result.symbols.map((s) => `${s.kind}:${s.name}:${s.role}`)).toEqual([
      'class:hot:def',
      'class:hot:ref',
    ]);
    expect(quadrantLanguage.namespaces).toEqual([['class']]);
  });

  it('gives every token of the parse a category', () => {
    const { tokens } = quadrantLanguage.parse(text, { keepTokens: true });
    const named = [...tokens!.kind.slice(0, tokens!.length)].map(
      (k) => quadrantLanguage.categories[k]
    );
    expect(named).not.toContain(undefined);
  });
});

describe('quadrant language facet: isValidId (rename, D92)', () => {
  it.each(['hot', 'Hot2', '1', 'A'])('accepts %s', (name) => {
    expect(quadrantLanguage.isValidId(name, 'class')).toBeUndefined();
  });

  it.each([
    ['', /empty/],
    ['a b', /spaces/],
    ['a\nb', /line break/],
    ['title', /keyword/],
    ['classDef', /keyword/],
    ['a_b', /letters and digits/],
    ['a-b', /letters and digits/],
    ['café', /letters and digits/],
    ['a:b', /letters and digits/],
  ])('rejects %j with a reason', (name, reason) => {
    expect(quadrantLanguage.isValidId(name, 'class')).toMatch(reason);
  });
});

describe('quadrant language facet: probe mode (R-LANG-7)', () => {
  const mode = (marked: string) => {
    const [text, at] = split(marked);
    return quadrantLanguage.parse(text, { keepTokens: true, probe: at }).probe?.mode;
  };

  it("records the lexer's start condition at the offset", () => {
    expect(mode(`${H}  A ¦`)).toBe('INITIAL');
    expect(mode(`${H}  title a ¦b`)).toBe('title');
    expect(mode(`${H}  accDescr {\n    a ¦b\n  }`)).toBe('acc_descr_multiline');
    expect(mode(`${H}  "a ¦b": [0.1, 0.2]`)).toBe('string');
    expect(mode(`${H}  A:::¦`)).toBe('class_name');
  });

  it('names comments, directives and front matter instead', () => {
    expect(mode(`${H}  %% a ¦comment\n`)).toBe('comment');
    expect(mode(`%%{init: {"theme": "¦dark"}}%%\n${H}`)).toBe('directive');
    expect(mode(`---\ntitle: ¦x\n---\n${H}`)).toBe('frontMatter');
  });

  it('leaves the parse as it is', () => {
    const [text, at] = split(`${H}  classDef c radius: 1\n  A:::¦c: [0.1, 0.2] x: 1\n  y-axis`);
    const plain = quadrantLanguage.parse(text, { keepTokens: true });
    const probed = quadrantLanguage.parse(text, { keepTokens: true, probe: at });
    const { probe, ...rest } = probed;
    expect(probe?.offset).toBe(at);
    expect(rest).toEqual(plain);
  });
});

describe('quadrant language facet: completions (D95)', () => {
  it('offers the header keyword in an empty text', () => {
    expect(complete('¦')).toEqual(['quadrantChart']);
    expect(complete('quad¦')).toEqual(['quadrantChart']);
  });

  it('offers the statement keywords at a statement start', () => {
    expect(complete(`${H}  ¦`)).toEqual(STATEMENT_KEYWORDS);
    expect(complete(`${H}  x-axis A --> B\n  q¦`)).toEqual([
      'quadrant-1',
      'quadrant-2',
      'quadrant-3',
      'quadrant-4',
    ]);
  });

  it('offers `-->` after an axis start label, once', () => {
    expect(complete(`${H}  x-axis Low ¦`)).toEqual(['-->']);
    expect(complete(`${H}  y-axis Low --¦`)).toEqual(['-->']);
    expect(complete(`${H}  x-axis Low --> ¦`)).toEqual([]);
  });

  it('offers class names after `:::` and as a classDef name', () => {
    const doc = `${H}  classDef hot radius: 10\n  B:::cold: [0.1, 0.1]\n`;
    expect(complete(`${doc}  A:::¦`)).toEqual(['hot', 'cold']);
    expect(complete(`${doc}  A:::h¦: [0.5, 0.5]`)).toEqual(['hot']);
    expect(complete(`${doc}  classDef ¦`)).toEqual(['hot', 'cold']);
  });

  it('offers style keys after `]` and a classDef name, not in a value', () => {
    expect(complete(`${H}  A: [0.1, 0.2] ¦`)).toEqual(STYLE_KEYS);
    expect(complete(`${H}  A: [0.1, 0.2] radius: 10, stroke-¦`)).toEqual([
      'stroke-color',
      'stroke-width',
    ]);
    expect(complete(`${H}  classDef hot ¦`)).toEqual(STYLE_KEYS);
    expect(complete(`${H}  classDef hot radius: ¦`)).toEqual([]);
  });

  it('offers nothing in text values, strings and coordinates', () => {
    expect(complete(`${H}  title a¦`)).toEqual([]);
    expect(complete(`${H}  accTitle: a¦`)).toEqual([]);
    expect(complete(`${H}  "a ¦": [0.1, 0.2]`)).toEqual([]);
    expect(complete(`${H}  A: [0.¦`)).toEqual([]);
  });
});

describe('quadrant language facet: hover (D93)', () => {
  const doc = `${H}  classDef hot radius: 10, color: #f00\n  A:::hot: [0.3, 0.6]\n`;

  it('describes a class, at its definition and at `:::`', () => {
    const at = (needle: string) =>
      `${doc.slice(0, doc.indexOf(needle))}¦${doc.slice(doc.indexOf(needle))}`;
    const def = hover(at('hot radius'));
    expect(def).toContain('**class** `hot`');
    expect(def).toContain('`classDef hot radius: 10, color: #f00`');
    expect(def).toContain('Used by 1 point');
    expect(hover(at('hot:'))).toBe(def);
  });

  it('describes a point and a keyword', () => {
    expect(hover(`${doc}  B¦: [0.1, 0.2] radius: 3`)).toBe(
      '**point** `B`\n\nx `0.1`, y `0.2` · Styles: `radius: 3`'
    );
    expect(hover(`${H}  quadrant-¦2 Q`)).toContain('**`quadrant-2`** the top left quadrant');
    expect(hover(`${H}  x-ax¦is A --> B`)).toContain('an axis');
  });
});
