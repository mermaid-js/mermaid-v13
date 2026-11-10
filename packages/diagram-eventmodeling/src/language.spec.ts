import { describe, expect, it } from 'vitest';
import { eventModelingLanguage, language } from './language.ts';

/**
 * The event modeling language facet (#609) at its own seam: `isValidId` per symbol kind (D528),
 * completions at a probe parse and hover over a plain parse, as the language service calls
 * them. The service-level behaviour (definition, references, rename, folding, semantic tokens,
 * diagnostics) is in the goldens (`packages/language-service/goldens/eventmodeling`).
 */
const CURSOR = '¦';

function split(marked: string): [text: string, at: number] {
  const at = marked.indexOf(CURSOR);
  return [marked.slice(0, at) + marked.slice(at + 1), at];
}

/** Completion labels at `¦`. */
function complete(marked: string): string[] {
  const [text, at] = split(marked);
  const result = eventModelingLanguage.parse(text, { keepTokens: true, probe: at });
  return eventModelingLanguage.completions(result.probe!, { text, result }).map((c) => c.label);
}

/** The probe's mode at `¦`. */
function mode(marked: string): string | undefined {
  const [text, at] = split(marked);
  return eventModelingLanguage.parse(text, { keepTokens: true, probe: at }).probe?.mode;
}

/** Hover contents at `¦` on a symbol, as the service passes it. */
function hover(marked: string): string | undefined {
  const [text, at] = split(marked);
  const result = eventModelingLanguage.parse(text, { keepTokens: true });
  const symbol = result.symbols.find((s) => s.range.start <= at && at <= s.range.end);
  return eventModelingLanguage.hover(
    { offset: at, ...(symbol ? { symbol } : {}) },
    { text, result }
  )?.contents;
}

const id = eventModelingLanguage.isValidId;

describe('event modeling language facet', () => {
  it('is the eventmodeling facet under the fixed name `language`, three name spaces (D528)', () => {
    expect(eventModelingLanguage.id).toBe('eventmodeling');
    expect(language).toBe(eventModelingLanguage);
    expect(eventModelingLanguage.namespaces).toEqual([['frame'], ['data'], ['entity']]);
  });

  it('keeps frame ids at one to three digits', () => {
    for (const ok of ['0', '01', '999']) {
      expect(id(ok, 'frame')).toBeUndefined();
      expect(id(ok)).toBeUndefined();
    }
    for (const bad of ['', '1000', 'a1', '1a', '0.1', ' 1', '١']) {
      expect(id(bad, 'frame')).toBeDefined();
    }
  });

  it('takes ASCII names that are no keyword, with dots only in entity names', () => {
    for (const ok of ['Cart', '_x', 'a1', 'tfx', 'evtA']) {
      expect(id(ok, 'data')).toBeUndefined();
      expect(id(ok, 'entity')).toBeUndefined();
    }
    expect(id('Shop.Item', 'entity')).toBeUndefined();
    expect(id('Shop.Item', 'data')).toMatch(/not a data name/);
    for (const keyword of ['tf', 'data', 'json', 'given', 'eventmodeling']) {
      expect(id(keyword, 'data')).toMatch(/is a keyword/);
      expect(id(`Shop.${keyword}`, 'entity')).toMatch(/is a keyword/);
    }
    for (const bad of ['Café', '1a', 'a-b', 'a b', '.a', 'a.', 'a..b']) {
      expect(id(bad, 'entity')).toBeDefined();
    }
    // After a blank, ` title…` starts a title (`data titleBar {` is `data`, ` title`, `Bar`).
    expect(id('titleBar', 'data')).toMatch(/would not read as one name/);
    expect(id('title', 'entity')).toMatch(/would not read as one name/);
  });

  it('completes keywords, kinds, sources, data names and types where the parser takes them', () => {
    const doc = 'eventmodeling\ntf 01 ui Screen\ndata Payload {\n  a: 1\n}\n';
    expect(complete(`${doc}tf 02 ¦`)).toContain('evt');
    expect(complete(`${doc}tf 02 cmd Add ->> ¦`)).toEqual(['01', '02']);
    expect(complete(`${doc}tf 02 cmd Add [[¦]]`)).toEqual(['Payload']);
    expect(complete(`${doc}tf 02 cmd Add \`j¦\` { a: 1 }`)).toEqual(['json', 'jsobj']);
    // `title` after a blank behind a token on its line, never at a line start.
    expect(complete(`${doc}tf 02 cmd Add ¦`)).toContain('title');
    expect(complete(`${doc}¦`)).not.toContain('title');
    expect(complete(`${doc}¦`)).toContain('tf');
  });

  it('offers nothing inside data, comments and statement text', () => {
    expect(mode('eventmodeling\ntf 01 ui A { a¦: 1 }\n')).toBe('data');
    expect(mode('eventmodeling\n/* a¦ */\n')).toBe('comment');
    expect(mode('eventmodeling\n// a¦\n')).toBe('comment');
    expect(mode('eventmodeling title My¦ model\n')).toBe('title');
    expect(mode('eventmodeling\ntf¦ 01 ui A\n')).toBe('INITIAL');
    // A block's token takes the line break after its `}`: right after the `}` is code.
    expect(mode('eventmodeling\ndata P {\n  a: 1\n}¦\ntf 01 ui A\n')).toBe('INITIAL');
    expect(mode('eventmodeling\ndata P {\n  a: 1\n¦}\n')).toBe('data');
    expect(complete('eventmodeling\ntf 01 ui A { a¦: 1 }\n')).toEqual([]);
  });

  it('hovers a frame with its lane and its sources, inferred or not', () => {
    const doc = 'eventmodeling\ntf 01 ui Screen\ntf 02 cmd Add\nrf 03 evt Reset\n';
    expect(hover(doc.replace('tf 02', 'tf 0¦2'))).toContain(
      'Source, inferred (no `->>`): `01` (`ui Screen`)'
    );
    expect(hover(doc.replace('tf 02', 'tf 0¦2'))).toContain('In the **Command/Read Model** lane.');
    expect(hover(doc.replace('rf 03', 'rf 0¦3'))).toContain('a reset frame with no `->>`');
    expect(hover(doc.replace('tf 01', 'tf 0¦1'))).toContain('No source: the first frame');
    expect(hover('eventmodeling\ntf 01 ui A\ntf 02 ui B\n'.replace('tf 02', 'tf 0¦2'))).toContain(
      'No source: no `->>`, and no earlier frame is in another lane.'
    );
  });
});
