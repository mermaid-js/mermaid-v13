import { describe, expect, it } from 'vitest';
import { vennCategories } from './generated/categories.ts';
import { language, vennLanguage } from './language.ts';
import { fixtureSource } from './layout/mmd.fixtures.ts';
import { parseVenn } from './parser/index.ts';
import { idText } from './parser/text.ts';

/**
 * The venn language facet (#498) at its own seam: its shape, the id rules rename uses (D418),
 * and the probe's modes, which gate completion. Completion, hover, definition, references,
 * rename, folding and semantic tokens through the service are the goldens
 * (`packages/language-service/goldens/venn`); a probe leaving the parse unchanged and the
 * symbols against v12 are `conformance/src/venn/{probe,service-symbols}.spec.ts`.
 */
const text = fixtureSource(
  'nightly-check/13-should-render-a-complex-venn-with-labels-text-nodes-and-styles'
);

/** The probe's mode `delta` characters into the first `needle` after `after`. */
function modeAt(needle: string, delta: number, after = 0): string {
  const at = text.indexOf(needle, after);
  if (at < 0) throw new Error(`no ${needle}`);
  return vennLanguage.parse(text, { keepTokens: true, probe: at + delta }).probe!.mode;
}

describe('the venn language facet', () => {
  it('is the facet the service imports, with the generated categories', () => {
    expect(language).toBe(vennLanguage);
    expect(vennLanguage.id).toBe('venn');
    expect(vennLanguage.categories).toBe(vennCategories);
    // D418: sets and text nodes are two name spaces; a set only referred to has no definition.
    expect(vennLanguage.namespaces).toEqual([['set'], ['text']]);
    expect(vennLanguage.declaredOnly).toBe(true);
  });

  it('takes a bare id only where v12 lexes it as one id', () => {
    for (const ok of ['A', 'a-b', '_x', 'settings', 'a-text', 'textual', 'titles', 'title-x'])
      expect(vennLanguage.isValidId(ok, 'set'), ok).toBeUndefined();
    // `set-x` lexes as the keyword `set` and then `-x` (v12: `set set-x` fails, cases file).
    for (const bad of [
      'Ä',
      'a b',
      '1a',
      '12',
      'set',
      'Set',
      'set-x',
      'text-b',
      'STYLE',
      'venn-beta',
      'title',
    ])
      expect(vennLanguage.isValidId(bad, 'set'), bad).toBeTypeOf('string');
  });

  it('writes ids in messages and hover by the same rule', () => {
    expect(idText('a-text')).toBe('a-text');
    expect(idText('set-x')).toBe('"set-x"');
    expect(idText('title')).toBe('"title"');
    expect(idText('Ä')).toBe('"Ä"');
  });

  it('marks each unknown id for the editor, where a render warns once (D417)', () => {
    const src = fixtureSource('nightly-check/undeclared-targets');
    const unknown = (d: { code: string }) => d.code === 'VENN_UNKNOWN_TARGET';
    expect(parseVenn(src).diagnostics.filter(unknown)).toHaveLength(1);
    const editor = vennLanguage.parse(src, { keepTokens: true }).diagnostics.filter(unknown);
    expect(editor.map((d) => src.slice(d.range.start, d.range.end))).toEqual([
      'Z',
      'A,B',
      'Q',
      'Y',
    ]);
  });

  it('quotes a name rename cannot write bare, and refuses one it cannot write at all', () => {
    expect(vennLanguage.quoteId?.('Big set')).toBe('"Big set"');
    expect(vennLanguage.quoteId?.('12')).toBe('"12"');
    // A text node's id may be a number; a set's may not.
    expect(vennLanguage.isValidId('12', 'text')).toBeUndefined();
    for (const bad of ['', ' a', 'a ', 'say "hi"', 'a\nb'])
      expect(vennLanguage.quoteId?.(bad), JSON.stringify(bad)).toBeUndefined();
    expect(vennLanguage.isValidId('say "hi"')).toMatch(/cannot be a venn id/);
  });

  it('names where the probe is: jison start conditions in code, else the value it is in', () => {
    expect(modeAt('description', 2)).toBe('frontMatter');
    expect(modeAt('Software', 2)).toBe('title');
    expect(modeAt('["Frontend"]', 4)).toBe('label');
    expect(modeAt('"React"', 2)).toBe('string');
    // A line start (the indent) is v12's `bol`; past it, `INITIAL`.
    expect(modeAt('set Backend', 0)).toBe('bol');
    expect(modeAt('set Backend', 2)).toBe('INITIAL');
  });
});
