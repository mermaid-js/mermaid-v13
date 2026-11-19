import { describe, expect, it } from 'vitest';
import { parseGenericTypes } from './generic-types.ts';

describe('parseGenericTypes', () => {
  it.each([
    // v12 `common.spec.ts`, "generic parser".
    ['test~T~', 'test<T>'],
    ['test~Array~Array~string~~~', 'test<Array<Array<string>>>'],
    ['test~Array~Array~string[]~~~', 'test<Array<Array<string[]>>>'],
    ['test ~Array~Array~string[]~~~', 'test <Array<Array<string[]>>>'],
    ['~test', '~test'],
    ['~test~T~', '~test<T>'],
    // A comma inside one pair stays in it; one between two generics splits them.
    ['Map~K, V~', 'Map<K, V>'],
    ['A~T~, B~U~', 'A<T>, B<U>'],
    // An odd `~` left in the middle stays as written.
    ['a~b~c~d', 'a<b~c>d'],
    ['string', 'string'],
    ['', ''],
  ])('reads %j as %j', (input, expected) => {
    expect(parseGenericTypes(input)).toBe(expected);
  });

  it('writes each pair as the brackets it is given', () => {
    expect(parseGenericTypes('List~Data~', ['&lt;', '&gt;'])).toBe('List&lt;Data&gt;');
    expect(parseGenericTypes('Map~K, V~', ['&lt;', '&gt;'])).toBe('Map&lt;K, V&gt;');
    expect(parseGenericTypes('List~Array~T~~', ['&lt;', '&gt;'])).toBe(
      'List&lt;Array&lt;T&gt;&gt;'
    );
    expect(parseGenericTypes('~test~T~', ['[', ']'])).toBe('~test[T]');
  });
});
