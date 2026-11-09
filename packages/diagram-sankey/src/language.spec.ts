import { describe, expect, it } from 'vitest';
import { language, sankeyLanguage } from './language.ts';

/**
 * The sankey language facet (#504) at its own seam: the parse the service reads, completions at
 * a probe parse, hover, `isValidId` and the name syntax, as the language service calls them.
 * The service-level behaviour (definition, references, rename, folding, semantic tokens) is in
 * the goldens (`packages/language-service/goldens/sankey`).
 */
const CURSOR = '¦';

function split(marked: string): [text: string, at: number] {
  const at = marked.indexOf(CURSOR);
  return [marked.slice(0, at) + marked.slice(at + 1), at];
}

/** Completion items at `¦`, as `label => insertText`. */
function complete(marked: string): string[] {
  const [text, at] = split(marked);
  const result = sankeyLanguage.parse(text, { keepTokens: true, probe: at });
  return sankeyLanguage
    .completions(result.probe!, { text, result })
    .map((c) => (c.insertText === c.label ? c.label : `${c.label} => ${c.insertText}`));
}

/** Each symbol as `<kind> <role> <name> = <text at its range>`. */
function symbols(text: string): string[] {
  const r = sankeyLanguage.parse(text, { keepTokens: true });
  return r.symbols.map(
    (s) => `${s.kind} ${s.role} ${s.name} = ${text.slice(s.range.start, s.range.end)}`
  );
}

describe('the sankey facet', () => {
  it('is exported under the name the service imports', () => {
    expect(language).toBe(sankeyLanguage);
    expect(language.id).toBe('sankey');
    expect(language.namespaces).toEqual([['node']]);
  });

  it('records each name as a node, the first its definition, at the trimmed field or the quotes', () => {
    const text = 'sankey\n  a ,"b c",1\n"a",b c,2\n"x""y",a,3\n';
    expect(symbols(text)).toEqual([
      'node def a = a',
      'node def b c = "b c"',
      'node ref a = "a"',
      'node ref b c = b c',
      'node def x"y = "x""y"',
      'node ref a = a',
    ]);
  });

  it('records nothing for a row with an error', () => {
    expect(symbols('sankey\na,b\nc,d,1')).toEqual(['node def c = c', 'node def d = d']);
  });
});

describe('sankey completion', () => {
  const rows = 'sankey\nCoal,Electricity,1\n';

  it('offers the node names at the start of a source or target field', () => {
    expect(complete(`${rows}¦`)).toEqual(['Coal', 'Electricity']);
    expect(complete(`${rows}Gas,¦`)).toEqual(['Coal', 'Electricity']);
    expect(complete(`${rows}Gas,¦\nOil,Gas,2`)).toEqual(['Coal', 'Electricity', 'Oil']);
  });

  it('filters by what is typed, and replaces the whole field', () => {
    const [text, at] = split(`${rows}Gas,El¦ec  ,3`);
    const result = sankeyLanguage.parse(text, { keepTokens: true, probe: at });
    const items = sankeyLanguage.completions(result.probe!, { text, result });
    expect(items.map((c) => [c.label, text.slice(c.range.start, c.range.end)])).toEqual([
      ['Electricity', 'Elec'],
    ]);
  });

  it('replaces a quoted name that runs on over a line break only up to that line break', () => {
    const [text, at] = split(`${rows}Gas,"¦Savings\nand pension",3`);
    const result = sankeyLanguage.parse(text, { keepTokens: true, probe: at });
    const items = sankeyLanguage.completions(result.probe!, { text, result });
    expect(items.map((c) => [c.label, text.slice(c.range.start, c.range.end)])).toEqual([
      ['Coal', 'Savings'],
      ['Electricity', 'Savings'],
    ]);
  });

  it('offers nothing in a value, and not the source of the row as its target', () => {
    expect(complete(`${rows}Gas,Coal,¦`)).toEqual([]);
    expect(complete(`${rows}Coal,¦`)).toEqual(['Electricity']);
  });

  it('leaves out a name whose only occurrence is the field being typed', () => {
    expect(complete(`${rows}Gas¦,Coal,2`)).toEqual([]);
    expect(complete(`${rows}Coa¦l,Gas,2`)).toEqual(['Coal']);
  });

  it('writes a name in quotes where it needs them, and escapes it inside quotes', () => {
    const quoted = 'sankey\n"Oil, ""crude""",Electricity,1\n';
    expect(complete(`${quoted}Gas,¦`)).toEqual(['Oil, "crude" => "Oil, ""crude"""', 'Electricity']);
    expect(complete(`${quoted}Gas,"¦`)).toEqual(['Oil, "crude" => Oil, ""crude""', 'Electricity']);
    expect(complete(`${quoted}Gas,"Oil, ""c¦`)).toEqual(['Oil, "crude" => Oil, ""crude""']);
  });

  it('offers `sankey` where the header goes, and nothing outside code', () => {
    expect(complete('¦')).toEqual(['sankey']);
    expect(complete('san¦')).toEqual(['sankey']);
    expect(complete('sankey\n%% ¦\nCoal,Gas,1')).toEqual([]);
    expect(complete(`---\ntitle: ¦\n---\n${rows}`)).toEqual([]);
  });
});

/** Hover at `¦`: the hovered text and the contents. */
function hover(marked: string): [string, string] | undefined {
  const [text, at] = split(marked);
  const result = sankeyLanguage.parse(text, { keepTokens: true });
  const symbol = result.symbols.find((s) => s.range.start <= at && at <= s.range.end);
  const t = result.tokens!;
  let token: { kind: number; range: { start: number; end: number } } | undefined;
  for (let j = 0; j < t.length; j++) {
    const range = { start: t.start[j] ?? 0, end: t.end[j] ?? 0 };
    if (range.start <= at && at <= range.end && range.end > range.start) {
      token = { kind: t.kind[j] ?? 0, range };
      break;
    }
  }
  const h = sankeyLanguage.hover(
    { offset: at, ...(token ? { token } : {}), ...(symbol ? { symbol } : {}) },
    { text, result }
  );
  return h && [text.slice(h.range.start, h.range.end), h.contents];
}

describe('sankey hover', () => {
  const src = 'sankey\nCoal,Electricity,10\nCoal,Heat,5.5\nGas,Coal,3\nGas,"Coal",abc\n';

  it('shows a node with what flows in and out', () => {
    expect(hover(src.replace('Gas,Coal,3', 'Gas,Co¦al,3'))).toEqual([
      'Coal',
      '**node** `Coal`\n\nIn: 3 (2 links) · out: 15.5 (2 links)',
    ]);
    expect(hover(src.replace('Electricity', 'Elec¦tricity'))).toEqual([
      'Electricity',
      '**node** `Electricity`\n\nIn: 10 (1 link) · out: 0',
    ]);
    expect(hover(src.replace('"Coal"', '"Co¦al"'))?.[0]).toBe('"Coal"');
  });

  it('shows the number a value reads as, and what is drawn', () => {
    expect(hover(src.replace('5.5', '5¦.5'))).toEqual(['5.5', '**value** 5.5']);
    expect(hover(src.replace('abc', 'a¦bc'))).toEqual([
      'abc',
      '**value** NaN\n\n`abc` is not a number, so the link counts as 0.',
    ]);
    expect(hover('sankey\nA,B,1;2\nA,C,-1\n'.replace('1;', '1¦;'))).toEqual([
      '1;2',
      '**value** 1\n\nOnly the number at the start is read: `;2` is ignored.',
    ]);
    expect(hover('sankey\nA,B,1\nA,C,-1\n'.replace('-1', '-¦1'))).toEqual([
      '-1',
      '**value** -1\n\n`-1` is negative, so the link counts as 0.',
    ]);
  });

  it('shows the doc of `sankey`', () => {
    expect(hover(`san¦${src.slice(3)}`)?.[1]).toMatch(/^\*\*`sankey`\*\*\n\nA sankey diagram is/);
  });
});

describe('sankey names (D398)', () => {
  const { read, write } = sankeyLanguage.nameSyntax!;

  /** What `read` takes as the occurrence of each symbol: `<text at its range> <quote>`. */
  function occurrences(text: string): string[] {
    return sankeyLanguage.parse(text, { keepTokens: true }).symbols.map((s) => {
      const o = read(text, s);
      return o ? `${text.slice(o.range.start, o.range.end)} ${o.quote ?? '-'}` : 'dropped';
    });
  }

  it('reads a bare name, and the text between the quotes of a quoted one', () => {
    expect(occurrences('sankey\n a ,"b ""c""",1\n" a ",b,2')).toEqual([
      'a -',
      'b ""c"" "',
      ' a  "',
      'b -',
    ]);
  });

  it('drops an occurrence whose text v12 did not read as written', () => {
    // A CRLF inside quotes is one line break to v12; a directive is cut out of a name.
    expect(occurrences('sankey\r\n"a\r\nb",c%%{init: {}}%%d,1')).toEqual(['dropped', 'dropped']);
  });

  it('writes a new name bare, or in quotes when it needs them, doubling `"`', () => {
    /** The text after renaming the first occurrence `read` takes in `text` to `name`. */
    const rename = (text: string, name: string) => {
      const s = sankeyLanguage.parse(text, { keepTokens: true }).symbols[0]!;
      const e = write(name, read(text, s)!, text);
      return text.slice(0, e.range.start) + e.newText + text.slice(e.range.end);
    };
    expect(rename('sankey\na,b,1', 'Natural gas')).toBe('sankey\nNatural gas,b,1');
    expect(rename('sankey\na,b,1', 'Oil, gas')).toBe('sankey\n"Oil, gas",b,1');
    expect(rename('sankey\na,b,1', 'x\ny')).toBe('sankey\n"x\ny",b,1');
    expect(rename('sankey\na,b,1', 'say "hi"')).toBe('sankey\n"say ""hi""",b,1');
    // A quoted field has no blanks outside its quotes: quoting in place takes them.
    expect(rename('sankey\n  a  ,b,1', 'Oil, gas')).toBe('sankey\n"Oil, gas",b,1');
    expect(rename('sankey\n  a  ,b,1', 'gas')).toBe('sankey\n  gas  ,b,1');
    expect(rename('sankey\n" a ",b,1', 'say "hi"')).toBe('sankey\n"say ""hi""",b,1');
    expect(rename('sankey\n"a",b,1', 'plain')).toBe('sankey\n"plain",b,1');
  });

  it('refuses a name v12 would not read back', () => {
    const valid = (name: string) => sankeyLanguage.isValidId(name, 'node');
    for (const name of ['Coal', 'Oil, gas', 'a\nb', 'say "hi"', '100%', 'x#y'])
      expect(valid(name), name).toBeUndefined();
    expect(valid('')).toBe('A node name cannot be empty.');
    expect(valid('Café')).toMatch(/outside printable ASCII/);
    expect(valid('a\tb')).toMatch(/outside printable ASCII/);
    expect(valid('a\r\nb')).toMatch(/outside printable ASCII/);
    expect(valid(' a')).toMatch(/starts or ends with a blank/);
    expect(valid('a\n')).toMatch(/starts or ends with a blank/);
    expect(valid('a\n\nb')).toMatch(/blank line/);
    expect(valid('a#35;')).toMatch(/entity/);
  });
});

describe('sankey names on a line v12 may rewrite', () => {
  it('drops them, so their rename is refused, and reads every other line', () => {
    const { read } = sankeyLanguage.nameSyntax!;
    const text = 'sankey\nstyle,b,1 :#f;\nb,c,2\r\nc,d,3';
    const kept = sankeyLanguage
      .parse(text, { keepTokens: true })
      .symbols.map((s) => (read(text, s) ? s.name : `(${s.name})`));
    expect(kept).toEqual(['(style)', '(b)', 'b', 'c', 'c', 'd']);
  });
});
