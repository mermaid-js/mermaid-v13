import type { Warning } from '@mermaid-js/core';
import { describe, expect, it } from 'vitest';
import { checkFontFamily, configFontFamily } from './font-family.ts';

describe('checkFontFamily', () => {
  it('keeps a family the style check allows', () => {
    expect(checkFontFamily('"Open Sans", sans-serif')).toBe('"Open Sans", sans-serif');
  });

  it('refuses a value that is not a font family', () => {
    expect(checkFontFamily('x;}<script>')).toBeUndefined();
  });
});

describe('configFontFamily', () => {
  const read = (value: unknown) => {
    const warnings: Warning[] = [];
    const family = configFontFamily(
      { actorFontFamily: value },
      'sequence',
      'actorFontFamily',
      (w) => warnings.push(w)
    );
    return { family, warnings };
  };

  it('returns an allowed family with no warning', () => {
    expect(read('serif')).toEqual({ family: 'serif', warnings: [] });
  });

  it('is undefined, with no warning, for an unset, blank or non-string value', () => {
    for (const v of [undefined, '', '   ', 12])
      expect(read(v)).toEqual({ family: undefined, warnings: [] });
  });

  it('drops a refused family with one STYLE_VALUE_DROPPED warning at the key', () => {
    expect(read('x;}<script>')).toEqual({
      family: undefined,
      warnings: [
        {
          code: 'STYLE_VALUE_DROPPED',
          message:
            'Dropped sequence.actorFontFamily "x;}<script>": it is not a font family Mermaid allows',
          path: 'sequence.actorFontFamily',
        },
      ],
    });
  });

  it('drops a refused family silently when no warn is given', () => {
    expect(configFontFamily({ k: 'x;}<script>' }, 'c4', 'k')).toBeUndefined();
  });
});
