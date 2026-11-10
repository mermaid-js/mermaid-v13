import { describe, expect, it } from 'vitest';
import { builtinIcons } from './render/builtins.ts';
import { BUILTIN_ICON_NAMES, language } from './language.ts';

describe('architecture language facet', () => {
  it('offers the icons the renderer draws as built-ins (D505)', () => {
    expect(BUILTIN_ICON_NAMES).toEqual([...builtinIcons().keys()]);
  });

  it.each(['db', 'a-b', 'x_1', '_', '9', 'services', 'rows', 'inx', 'l', 'r2', 'bTitle', 'Api'])(
    'accepts %s as an id of every kind',
    (name) => {
      for (const kind of ['service', 'junction', 'group']) {
        expect(language.isValidId(name, kind)).toBeUndefined();
      }
    }
  );

  // D508: what v12 cannot lex as one id, wherever an id goes.
  it.each([
    ['', 'empty'],
    ['Backend', 'side'],
    ['L', 'side'],
    ['T1', 'side'],
    ['service', 'keyword'],
    ['architecture-beta', 'keyword'],
    ['in', 'keyword'],
    ['web-', 'not an id'],
    ['-web', 'not an id'],
    ['a b', 'not an id'],
    ['café', 'not an id'],
    ['a.b', 'not an id'],
    ['title', 'title'],
    ['titlebar', 'title'],
    ['accDescr', 'does not read as one id'],
    ['accTitle', 'does not read as one id'],
  ])('refuses %j (%s)', (name, why) => {
    expect(language.isValidId(name)).toContain(why);
  });
});
