import { describe, expect, it } from 'vitest';
import { language, wardleyLanguage } from './language.ts';

/**
 * The wardley language facet (#500) at its own seam: completions at a probe parse and hover over
 * a plain parse, as the language service calls them, `isValidId` and `quoteId`. The
 * service-level behaviour (definition, references, rename, folding, semantic tokens) is in the
 * goldens (`packages/language-service/goldens/wardley`).
 */
const CURSOR = '¦';

function split(marked: string): [text: string, at: number] {
  const at = marked.indexOf(CURSOR);
  return [marked.slice(0, at) + marked.slice(at + 1), at];
}

/** Completion labels at `¦`. */
function complete(marked: string): string[] {
  const [text, at] = split(marked);
  const result = wardleyLanguage.parse(text, { keepTokens: true, probe: at });
  return wardleyLanguage.completions(result.probe!, { text, result }).map((c) => c.label);
}

/** Hover at `¦`, given the token and symbol the service would pass. */
function hover(marked: string): string | undefined {
  const [text, at] = split(marked);
  const result = wardleyLanguage.parse(text, { keepTokens: true });
  const tokens = result.tokens!;
  // The service's token: a non-blank one containing the offset, else one ending at it.
  let token: { kind: number; range: { start: number; end: number } } | undefined;
  let touching: typeof token;
  for (let i = 0; i < tokens.length; i++) {
    const start = tokens.start[i]!;
    const end = tokens.end[i]!;
    if (!/\S/.test(text.slice(start, end))) continue;
    if (start <= at && at < end) token = { kind: tokens.kind[i]!, range: { start, end } };
    else if (end === at) touching = { kind: tokens.kind[i]!, range: { start, end } };
  }
  token ??= touching;
  const symbol = result.symbols.find((x) => x.range.start <= at && at <= x.range.end);
  return wardleyLanguage.hover({ offset: at, token, symbol }, { text, result })?.contents;
}

const STATEMENTS = [
  'title',
  'accTitle',
  'accDescr:',
  'accDescr {',
  'size',
  'evolution',
  'anchor',
  'component',
  'evolve',
  'pipeline',
  'note',
  'annotations',
  'annotation',
  'accelerator',
  'deaccelerator',
];
const MAP =
  'wardley-beta\nanchor User [0.95, 0.6]\ncomponent Tea [0.5, 0.7]\ncomponent "notebook" [0.2, 0.3]\n';

describe('wardley language facet', () => {
  it('is the wardley facet, exported under the fixed name `language`', () => {
    expect(wardleyLanguage.id).toBe('wardley');
    expect(language).toBe(wardleyLanguage);
    expect(wardleyLanguage.namespaces).toEqual([['node']]);
  });

  it('parses with the tokens kept and a category for every token kind it emits', () => {
    const text = `${MAP}title Shop\nUser -> Tea; serves %% c\nevolve Tea 0.8\naccDescr: x\n`;
    const result = wardleyLanguage.parse(text, { keepTokens: true });
    expect(result.diagnostics).toEqual([]);
    const kinds = [...result.tokens!.kind.slice(0, result.tokens!.length)];
    expect(kinds.map((k) => wardleyLanguage.categories[k])).not.toContain(undefined);
    expect(result.symbols.map((s) => `${s.kind}:${s.role}:${s.name}`)).toEqual([
      'node:def:User',
      'node:def:Tea',
      'node:def:notebook',
      'node:ref:User',
      'node:ref:Tea',
      'node:ref:Tea',
    ]);
  });

  it("reads a pipeline component's node id as its parent's name and its own (D427)", () => {
    const text =
      'wardley-beta\ncomponent P [0.5, 0.5]\npipeline P {\n  component c [0.2]\n}\nevolve P_c 0.8\nX -> "P_c"\n';
    const { symbols } = wardleyLanguage.parse(text, { keepTokens: true });
    const shown = symbols.map((s) => `${s.role}:${text.slice(s.range.start, s.range.end)}`);
    expect(shown).toEqual(['def:P', 'ref:P', 'def:c', 'ref:P', 'ref:c', 'ref:P', 'ref:c']);
  });
});

describe('wardley isValidId and quoteId (D423, D427)', () => {
  const ok = (name: string) => wardleyLanguage.isValidId(name, 'node');

  it('accepts what the lexer reads as one unquoted name', () => {
    for (const name of ['Tea', 'Cup of Tea', 'A-B', 'a_1', 'Tea (hot)', 'titleX', 'accTitle']) {
      expect(ok(name), name).toBeUndefined();
    }
  });

  it('refuses a keyword or strategy, and a name that starts with one (no word boundary)', () => {
    expect(ok('note')).toMatch(/^`note` is a keyword, .* quote it, as `"note"`\.$/);
    expect(ok('notebook')).toMatch(/^`notebook` starts with the keyword `note`/);
    expect(ok('buyer')).toMatch(/^`buyer` starts with the keyword `buy`/);
    expect(ok('market')).toMatch(/^`market` is a keyword/);
    expect(ok('title X')).toMatch(/^`title X` starts with the keyword `title`/);
    expect(ok('wardley-betas')).toMatch(/starts with the keyword `wardley-beta`/);
  });

  it('refuses a leading digit, punctuation, outer blanks and an empty name', () => {
    expect(ok('1A')).toMatch(/^`1A` starts with a digit/);
    expect(ok('12')).toMatch(/^`12` starts with a digit/);
    expect(ok('')).toBe('A name cannot be empty.');
    for (const name of ['a,b', 'a[b', 'A->B', 'a;b', ' A', 'A ', 'é', 'a"b']) {
      expect(ok(name), name).toMatch(/is not an unquoted name/);
    }
  });

  it('quotes a name in `"…"`, else in `\'…\'`, and none it cannot hold as written', () => {
    const quote = (name: string) => wardleyLanguage.quoteId?.(name, 'node');
    expect(quote('notebook')).toBe('"notebook"');
    expect(quote('say "hi"')).toBe('\'say "hi"\'');
    for (const name of ['a"b\'c', 'a\\b', 'a\nb', '']) expect(quote(name), name).toBeUndefined();
  });
});

describe('wardley completions (D95)', () => {
  it('offers `wardley-beta` in an empty text', () => {
    expect(complete('¦')).toEqual(['wardley-beta']);
    expect(complete('war¦')).toEqual(['wardley-beta']);
  });

  it('offers the statements at the start of a line, `component` inside a pipeline', () => {
    expect(complete('wardley-beta\n¦')).toEqual(STATEMENTS);
    expect(complete(`${MAP}¦\nTea -> User`)).toEqual(STATEMENTS);
    expect(complete('wardley-beta\n  acc¦')).toEqual([
      'accTitle',
      'accDescr:',
      'accDescr {',
      'accelerator',
    ]);
    expect(complete(`${MAP}pipeline Tea {\n  ¦\n}`)).toEqual(['component']);
  });

  it("offers `label`, the strategies and `inertia` after a component's coordinates, in v12's order", () => {
    const c = 'wardley-beta\ncomponent A [0.5, 0.5]';
    const strategies = ['(build)', '(buy)', '(outsource)', '(market)'];
    expect(complete(`${c} ¦`)).toEqual(['label', ...strategies, 'inertia', '(inertia)']);
    expect(complete(`${c} label [1, 2] ¦`)).toEqual([...strategies, 'inertia', '(inertia)']);
    expect(complete(`${c} (build) ¦`)).toEqual(['inertia', '(inertia)']);
    expect(complete(`${c} inertia ¦`)).toEqual([]);
    expect(complete(`${c} (¦`)).toEqual(['build', 'buy', 'outsource', 'market', 'inertia']);
    expect(complete(`${c} (bu¦`)).toEqual(['build', 'buy']);
    expect(complete(`${c} (build) (¦`)).toEqual(['inertia']);
  });

  it('offers the arrows and flows after a name, the flows after the second', () => {
    const arrows = [
      '->',
      '-.->',
      '-->',
      '>',
      '+>',
      '+<',
      '+<>',
      "+'label'>",
      "+'label'<",
      "+'label'<>",
    ];
    expect(complete(`${MAP}Tea ¦`)).toEqual(arrows);
    expect(complete(`${MAP}Tea -> User ¦`)).toEqual(['+>', '+<', '+<>']);
    expect(complete('wardley-beta\nevolution Genesis ¦')).toEqual(['->']);
  });

  it('offers the declared names after an arrow, a flow, `evolve`, `pipeline` and the (de)accelerators', () => {
    const names = ['User', 'Tea', 'notebook'];
    expect(complete(`${MAP}Tea -> ¦`)).toEqual(names);
    expect(complete(`${MAP}Tea -.-> T¦`)).toEqual(['Tea']);
    const arrowsAfterFlow = ['->', '-.->', '-->', '>', "+'label'>", "+'label'<", "+'label'<>"];
    expect(complete(`${MAP}Tea +> ¦`)).toEqual([...arrowsAfterFlow, ...names]);
    for (const kw of ['evolve', 'pipeline', 'accelerator', 'deaccelerator'])
      expect(complete(`${MAP}${kw} ¦`), kw).toEqual(names);
    // A new name goes after `anchor` and `component`, and evolution stages are no nodes.
    expect(complete(`${MAP}component ¦`)).toEqual([]);
    expect(complete(`${MAP}anchor ¦`)).toEqual([]);
    expect(complete(`${MAP}evolution Genesis -> ¦`)).toEqual([]);
  });

  it('inserts a name that cannot be written unquoted in quotes (D423)', () => {
    const text = `${MAP}Tea -> no`;
    const result = wardleyLanguage.parse(text, { keepTokens: true, probe: text.length });
    expect(wardleyLanguage.completions(result.probe!, { text, result })).toMatchObject([
      { label: 'notebook', kind: 'node', insertText: '"notebook"', detail: 'component' },
    ]);
  });

  it('offers nothing in a quoted text, a statement text or outside code', () => {
    expect(complete('wardley-beta\nnote "a¦"')).toEqual([]);
    expect(complete('wardley-beta\ntitle Te¦')).toEqual([]);
    expect(complete('wardley-beta\naccTitle: ¦')).toEqual([]);
    expect(complete('wardley-beta\naccDescr {\n  a ¦\n}')).toEqual([]);
    expect(complete('wardley-beta\n%% a ¦comment')).toEqual([]);
    expect(complete('---\ntitle: ¦\n---\nwardley-beta')).toEqual([]);
  });

  it('replaces the whole word being typed', () => {
    const text = 'wardley-beta\ncompxx';
    const result = wardleyLanguage.parse(text, { keepTokens: true, probe: 17 });
    const [item] = wardleyLanguage.completions(result.probe!, { text, result });
    expect(item).toMatchObject({
      label: 'component',
      insertText: 'component ',
      range: { start: 13, end: 19 },
    });
  });
});

describe('wardley hover (D93, D428)', () => {
  const map = `${MAP}component Kettle [0.43, 1.5]\nUser -> Tea\nTea -> Ghost\nevolve Kettle 0.62\npipeline Kettle {\n  component Electric [0.8]\n}\nannotations [1, 0]\n`;
  const at = (needle: string) => {
    const i = needle.indexOf(CURSOR);
    const plain = needle.slice(0, i) + needle.slice(i + 1);
    const o = map.indexOf(plain) + i;
    return hover(map.slice(0, o) + CURSOR + map.slice(o));
  };

  it('shows a node with its kind, visibility and evolution in percent', () => {
    expect(at('Us¦er [')).toBe('**anchor** `User`\n\nVisibility 95 %, evolution 60 %.');
    expect(at('User -> T¦ea')).toBe('**component** `Tea`\n\nVisibility 50 %, evolution 70 %.');
    expect(at('"note¦book"')).toBe('**component** `notebook`\n\nVisibility 20 %, evolution 30 %.');
    expect(at('evolve Ket¦tle')).toBe(
      '**component** `Kettle`\n\nVisibility 43 %, evolution 1.5 %.\n\nEvolves to 62 %.'
    );
    // A pipeline's component is drawn on its parent's line.
    expect(at('Elec¦tric')).toBe(
      '**pipeline component** `Electric`\n\nVisibility 43 %, evolution 80 %.'
    );
  });

  it('says when no anchor or component has the name', () => {
    expect(at('Gh¦ost')).toBe('**node** `Ghost`\n\nNo anchor or component is named `Ghost`.');
  });

  it('shows the percentage a coordinate is read as (D428)', () => {
    expect(at('[0.4¦3')).toBe(
      '**visibility** `0.43`\n\n43 % of the axis: a value up to 1 is a fraction of it.'
    );
    expect(at('1.¦5]')).toBe(
      '**evolution** `1.5`\n\n1.5 % of the axis: a value above 1 is a percentage (`1.0` is 100 %).'
    );
    expect(at('[1¦, 0]')).toMatch(/^\*\*visibility\*\* `1`\n\n100 % of the axis/);
    // What the model holds: out of range, kept as 100.
    expect(hover('wardley-beta\ncomponent A [0.5, 12¦0.0]')).toBe(
      '**evolution** `120.0`\n\n100 % of the axis: a value above 100 is out of range, and the map draws it at 100 %.'
    );
  });

  it('shows the keyword docs of the grammar file, only the keyword of a text statement', () => {
    expect(hover('ward¦ley-beta')).toMatch(/^\*\*`wardley-beta`\*\*\n\n`wardley-beta`: starts/);
    expect(at('evo¦lve')).toMatch(/^\*\*`evolve`\*\*\n\n`evolve Kettle 0.8`/);
    expect(at('-¦> Tea')).toMatch(/^\*\*`->`\*\*/);
    expect(hover('wardley-beta\ntit¦le Shop')).toMatch(/^\*\*`title`\*\*\n\n`title Tea Shop`/);
    expect(hover('wardley-beta\ntitle Sh¦op')).toBeUndefined();
    expect(hover('wardley-beta\ncomponent A [0.5, 0.5] (bu¦ild)')).toMatch(/^\*\*`build`\*\*/);
  });
});
