import { describe, expect, it } from 'vitest';
import { cynefinLanguage, language } from './language.ts';

/**
 * The cynefin language facet (#470) at its own seam: completions at a probe parse and hover over
 * a plain parse, as the language service calls them. The service-level behaviour (definition,
 * references, refused rename, folding, semantic tokens) is in the goldens
 * (`packages/language-service/goldens/cynefin`).
 */
const CURSOR = '¦';
const H = 'cynefin-beta\n';
const DOMAINS = ['complex', 'complicated', 'clear', 'chaotic', 'confusion'];
const LINE_START = [...DOMAINS, 'title', 'accTitle', 'accDescr'];

function split(marked: string): [text: string, at: number] {
  const at = marked.indexOf(CURSOR);
  return [marked.slice(0, at) + marked.slice(at + 1), at];
}

/** Completion labels at `¦`. */
function complete(marked: string): string[] {
  const [text, at] = split(marked);
  const result = cynefinLanguage.parse(text, { keepTokens: true, probe: at });
  return cynefinLanguage.completions(result.probe!, { text, result }).map((c) => c.label);
}

/** Hover at `¦`, given the token and symbol the service would pass. */
function hover(marked: string): string | undefined {
  const [text, at] = split(marked);
  const result = cynefinLanguage.parse(text, { keepTokens: true });
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
  const symbol = result.symbols.find((s) => s.range.start <= at && at <= s.range.end);
  return cynefinLanguage.hover({ offset: at, token, symbol }, { text, result })?.contents;
}

describe('cynefin language facet', () => {
  it('is the cynefin facet, exported under the fixed name `language`', () => {
    expect(cynefinLanguage.id).toBe('cynefin');
    expect(language).toBe(cynefinLanguage);
    expect(cynefinLanguage.namespaces).toEqual([['domain']]);
  });

  it('parses with the tokens kept and a category for every token kind it emits', () => {
    const text = `${H}  title T\n  complex "a"\n  complex --> clear : "x"\n  accDescr: d\n`;
    const result = cynefinLanguage.parse(text, { keepTokens: true });
    expect(result.diagnostics).toEqual([]);
    const kinds = [...result.tokens!.kind.slice(0, result.tokens!.length)];
    expect(kinds.map((k) => cynefinLanguage.categories[k])).not.toContain(undefined);
    expect(result.symbols.map((s) => `${s.kind}:${s.name}:${s.role}`)).toEqual([
      'domain:complex:def',
      'domain:complex:ref',
      'domain:clear:ref',
    ]);
  });

  it('refuses every new name for a domain: the five names are fixed (D367)', () => {
    for (const name of ['renamed', 'complex', 'clear']) {
      expect(cynefinLanguage.isValidId(name, 'domain')).toMatch(/fixed/);
    }
  });
});

describe('cynefin completions (D95)', () => {
  it('offers `cynefin-beta` in an empty text', () => {
    expect(complete('¦')).toEqual(['cynefin-beta']);
    expect(complete('cyn¦')).toEqual(['cynefin-beta']);
  });

  it('offers the domains and the statements at the start of a line', () => {
    expect(complete(`${H}¦`)).toEqual(LINE_START);
    expect(complete(`${H}  ¦`)).toEqual(LINE_START);
    expect(complete(`${H}  com¦`)).toEqual(['complex', 'complicated']);
    expect(complete(`${H}  acc¦`)).toEqual(['accTitle', 'accDescr']);
  });

  it('offers an item inside a block, at the start of a line too', () => {
    expect(complete(`${H}complex "a"\n  ¦`)).toEqual([...LINE_START, '"']);
    expect(complete(`${H}complex\n  ¦`)).toEqual([...LINE_START, '"']);
    expect(complete(`${H}complex "a" ¦`)).toEqual(['"']);
    expect(complete(`${H}complex "a"¦`)).toEqual(['"']);
  });

  it('offers `-->` and an item after a domain name', () => {
    expect(complete(`${H}complex ¦`)).toEqual(['-->', '"']);
    expect(complete(`${H}complex -¦`)).toEqual(['-->']);
  });

  it('offers the domains after `-->`', () => {
    expect(complete(`${H}complex --> ¦`)).toEqual(DOMAINS);
    expect(complete(`${H}complex -->¦`)).toEqual(DOMAINS);
    expect(complete(`${H}complex --> ch¦`)).toEqual(['chaotic']);
  });

  it('offers `:` after a transition target, then a label', () => {
    expect(complete(`${H}complex --> clear ¦`)).toEqual([':']);
    expect(complete(`${H}complex --> clear : ¦`)).toEqual(['"']);
    expect(complete(`${H}complex --> clear :¦`)).toEqual(['"']);
  });

  it('offers nothing in an item, a label, a statement text or outside code', () => {
    expect(complete(`${H}complex "Pro¦be"`)).toEqual([]);
    expect(complete(`${H}complex "Pro¦`)).toEqual([]);
    expect(complete(`${H}complex --> clear : "x¦"`)).toEqual([]);
    expect(complete(`${H}title Inc¦`)).toEqual([]);
    expect(complete(`${H}accTitle: ¦`)).toEqual([]);
    expect(complete(`${H}accDescr {\n  a ¦\n}`)).toEqual([]);
    expect(complete(`${H}%% a ¦comment`)).toEqual([]);
    expect(complete(`${H}complex --> clear : "x" ¦`)).toEqual([]);
  });

  it('replaces the whole word being typed', () => {
    const text = `${H}chaxx`;
    const result = cynefinLanguage.parse(text, { keepTokens: true, probe: H.length + 3 });
    const [item] = cynefinLanguage.completions(result.probe!, { text, result });
    expect(item).toMatchObject({
      label: 'chaotic',
      insertText: 'chaotic',
      range: { start: H.length, end: H.length + 5 },
    });
  });
});

describe('cynefin hover (D93)', () => {
  it("shows a domain's decision model and practice, as v12 drew them", () => {
    expect(hover(`${H}com¦plex "a"`)).toMatch(
      /^\*\*`complex`\*\* domain\n\nProbe → Sense → Respond · Emergent Practices\n\n/
    );
    expect(hover(`${H}complex --> cle¦ar`)).toMatch(
      /^\*\*`clear`\*\* domain\n\nSense → Categorise → Respond · Best Practices/
    );
    expect(hover(`${H}complicated¦`)).toMatch(/Sense → Analyse → Respond · Good Practices/);
    expect(hover(`${H}cha¦otic`)).toMatch(/Act → Sense → Respond · Novel Practices/);
    expect(hover(`${H}conf¦usion`)).toMatch(/^\*\*`confusion`\*\* domain\n\nDisorder\n\n/);
  });

  it('says when a block is replaced by a later one (D364)', () => {
    expect(hover(`${H}comp¦lex "a"\ncomplex "b"`)).toMatch(
      /Replaced: only the last `complex` block \(line 3\) is drawn\.$/
    );
    expect(hover(`${H}complex "a"\ncomp¦lex "b"`)).not.toMatch(/Replaced/);
  });

  it('shows the keyword docs of the grammar file', () => {
    expect(hover('cynefin-¦beta')).toMatch(/^\*\*`cynefin-beta`\*\*\n\n`cynefin-beta`: starts/);
    expect(hover(`${H}complex -¦-> clear`)).toMatch(/a transition from one domain to another/);
    expect(hover(`${H}  tit¦le Incident`)).toMatch(/title drawn above the diagram/);
    expect(hover(`${H}  title Inc¦ident`)).toBeUndefined();
    expect(hover(`${H}  acc¦Title: x`)).toMatch(/accessible title/);
    expect(hover(`${H}  acc¦Descr {\n x\n }`)).toMatch(/accessible description/);
    expect(hover(`${H}complex "Pro¦be"`)).toBeUndefined();
  });
});
