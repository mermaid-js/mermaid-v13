import { describe, expect, it } from 'vitest';
import { LITERAL, parseGenericTypes, REFERENCES } from './generic-types.ts';

describe('parseGenericTypes', () => {
  // v12 `diagrams/common/common.spec.ts`, "generic parser".
  it.each([
    ['test~T~', 'test<T>'],
    ['test~Array~Array~string~~~', 'test<Array<Array<string>>>'],
    ['test~Array~Array~string[]~~~', 'test<Array<Array<string[]>>>'],
    ['test ~Array~Array~string[]~~~', 'test <Array<Array<string[]>>>'],
    ['~test', '~test'],
    ['~test~T~', '~test<T>'],
  ])('reads %s as v12 did: %s', (input, expected) => {
    expect(parseGenericTypes(input)).toBe(expected);
  });

  it.each([
    ['Map~K, V~', 'Map<K, V>'],
    ['Map~K,V~ m, List~T~ l', 'Map<K,V> m, List<T> l'],
    ['a,b', 'a,b'],
    [',~T~,', ',<T>,'],
    ['', ''],
    ['~', '~'],
  ])('joins the sets around a comma only inside one pair: %s', (input, expected) => {
    expect(parseGenericTypes(input)).toBe(expected);
  });

  it('writes the brackets it is given', () => {
    expect(parseGenericTypes('List~Data~', LITERAL)).toBe('List<Data>');
    expect(parseGenericTypes('List~Data~', REFERENCES)).toBe('List&lt;Data&gt;');
    expect(parseGenericTypes('Box~List~B~~', REFERENCES)).toBe('Box&lt;List&lt;B&gt;&gt;');
  });
});
