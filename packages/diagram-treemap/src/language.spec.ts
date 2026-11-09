import { describe, expect, it } from 'vitest';
import { language, treemapLanguage } from './language.ts';

/**
 * The treemap language facet (#511) at its own seam: its shape and `isValidId`. Completion,
 * hover and everything the service builds on the parse (definition, references, rename,
 * folding, semantic tokens) are in the goldens (`packages/language-service/goldens/treemap`),
 * which read their diagram sources from `.mmd` files.
 */
describe('treemap language facet', () => {
  it('is the treemap facet, exported under the fixed name `language` (D408)', () => {
    expect(language).toBe(treemapLanguage);
    expect(treemapLanguage.id).toBe('treemap');
    expect(treemapLanguage.namespaces).toEqual([['node'], ['class']]);
    expect(treemapLanguage.standalone).toEqual(['node']);
    expect(treemapLanguage.declaredOnly).toBe(true);
  });

  it.each([
    ['hot', undefined],
    ['_x', undefined],
    ['a1_b', undefined],
    ['x', '`x` has one character, and class names need two characters or more.'],
    ['', 'A name cannot be empty.'],
    ['1a', '`1a` starts with a digit, and a class name cannot.'],
    [
      'my-class',
      '`my-class` is not a class name: a class name is ASCII letters, digits and `_`, and does not start with a digit.',
    ],
    [
      'café',
      '`café` is not a class name: a class name is ASCII letters, digits and `_`, and does not start with a digit.',
    ],
    ['treemap', '`treemap` is a keyword, so it cannot be a class name.'],
    ['treemaps', '`treemaps` starts with the keyword `treemap`, and a class name cannot.'],
    ['titles', '`titles` starts with the keyword `title`, and a class name cannot.'],
    ['classDef', '`classDef` is a keyword, so it cannot be a class name.'],
    ['accDescr', '`accDescr` is a keyword, so it cannot be a class name.'],
  ])('isValidId(%j, class) (D401)', (name, reason) => {
    expect(treemapLanguage.isValidId(name, 'class')).toBe(reason);
  });

  it('leaves quoted node names to the service', () => {
    expect(treemapLanguage.isValidId('Two words "x"', 'node')).toBeUndefined();
  });
});
