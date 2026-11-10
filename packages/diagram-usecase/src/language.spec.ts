import { describe, expect, it } from 'vitest';
import { usecaseCategories } from './generated/categories.ts';
import { language, usecaseLanguage } from './language.ts';

/**
 * The usecase language facet (#568) at its own seam: its shape, the name rules rename uses
 * (D477, D191) and the probe's modes, which gate completion. Completion, hover, definition,
 * references, rename, folding and semantic tokens through the service are the goldens
 * (`packages/language-service/goldens/usecase`); a probe leaving the parse unchanged and the
 * symbols against v12 are `conformance/src/usecase/{probe,service-symbols}.spec.ts`.
 */
const TEXT = [
  '---',
  'title: Shop',
  '---',
  'usecase-beta',
  '  %% a comment',
  '  accTitle: The shop',
  '  actor User@{ type: hollow } <<Human>>',
  '  "Reset password" --> Login',
  '  json Data@{ "a": 1 }',
  '',
].join('\n');

/** The probe's mode `delta` characters into the first `needle`. */
function modeAt(needle: string, delta: number): string {
  const at = TEXT.indexOf(needle);
  if (at < 0) throw new Error(`no ${needle}`);
  return usecaseLanguage.parse(TEXT, { keepTokens: true, probe: at + delta }).probe!.mode;
}

describe('the usecase language facet', () => {
  it('is the facet the service imports, with the generated categories', () => {
    expect(language).toBe(usecaseLanguage);
    expect(usecaseLanguage.id).toBe('usecase');
    expect(usecaseLanguage.categories).toBe(usecaseCategories);
    // D477: one id map in v12, so one name space; the first mention defines.
    expect(usecaseLanguage.namespaces).toEqual([['actor', 'usecase', 'boundary', 'json', 'edge']]);
    expect(usecaseLanguage.declaredOnly).toBeUndefined();
  });

  it('refuses keywords, the PlantUML words, an empty name, a quote and a line break', () => {
    for (const ok of ['User', '_x', '1', 'actors', 'End', 'Reset password'])
      expect(usecaseLanguage.isValidId(ok, 'actor'), ok).toBeUndefined();
    for (const bad of ['actor', 'end', 'TB', 'Include', 'true', 'usecase-beta'])
      expect(usecaseLanguage.isValidId(bad), bad).toMatch(/keyword/);
    for (const bad of ['package', 'Rectangle', 'SKINPARAM', 'allowmixing', 'newpage'])
      expect(usecaseLanguage.isValidId(bad), bad).toMatch(/PlantUML/);
    for (const bad of ['', ' ', 'a\nb', 'say "hi"'])
      expect(usecaseLanguage.isValidId(bad), JSON.stringify(bad)).toBeTypeOf('string');
    // A relation id and a JSON table's id are bare ids only.
    expect(usecaseLanguage.isValidId('a b', 'edge')).toMatch(/letters, digits/);
    expect(usecaseLanguage.isValidId('a-b', 'json')).toMatch(/letters, digits/);
  });

  it('reads a quoted name between its quotes and a quoted element by its id, and writes both', () => {
    const syntax = usecaseLanguage.nameSyntax!;
    const text = '"Reset password" Reset_password Other';
    const read = (start: number, end: number) =>
      syntax.read(text, {
        name: 'Reset password',
        kind: 'usecase',
        role: 'ref',
        range: { start, end },
      });
    expect(read(0, 16)).toEqual({ range: { start: 1, end: 15 }, quote: '"' });
    expect(read(17, 31)).toEqual({ range: { start: 17, end: 31 } });
    expect(read(32, 37)).toBeUndefined();
    const at = { range: { start: 1, end: 15 }, quote: '"' };
    expect(syntax.write('Change it', at, text).newText).toBe('Change it');
    expect(syntax.write('Change it', { range: { start: 17, end: 31 } }, text).newText).toBe(
      'Change_it'
    );
  });

  it('names where the probe is: the lexer mode in code, else the value it is in', () => {
    expect(modeAt('title', 2)).toBe('frontMatter');
    expect(modeAt('a comment', 2)).toBe('comment');
    expect(modeAt('The shop', 2)).toBe('acc');
    expect(modeAt('type:', 1)).toBe('default');
    expect(modeAt('Human', 2)).toBe('stereotype');
    expect(modeAt('Reset password', 2)).toBe('string');
    expect(modeAt('"a"', 0)).toBe('jsonBody');
    expect(modeAt('Login', 2)).toBe('default');
  });
});
