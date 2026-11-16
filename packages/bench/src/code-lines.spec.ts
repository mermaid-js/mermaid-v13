/** The line counter of the size report (#814): non-blank, non-comment lines of TypeScript. */
import { describe, expect, it } from 'vitest';
import { countCodeLines } from './code-lines.ts';

describe('countCodeLines', () => {
  it('skips blank lines, line comments and block comments', () => {
    const source = [
      '/**',
      ' * A doc comment.',
      ' */',
      '',
      'export const a = 1; // trailing comment',
      '   ',
      '// a line comment',
      '/* a block */ const b = 2;',
      'const c = 3; /* a block',
      '   that ends later */',
    ].join('\n');
    expect(countCodeLines(source)).toBe(3);
  });

  it('counts every non-blank line of a multi-line string, comment markers included', () => {
    const source = [
      'const t = `first',
      '// not a comment',
      '',
      '   ',
      '/* not a comment either */`;',
    ].join('\n');
    expect(countCodeLines(source)).toBe(3);
  });

  it('reads a regular expression with comment markers as code', () => {
    expect(countCodeLines('const r = /\\/\\/|\\/\\*/g;\nconst s = "/*";\n')).toBe(2);
  });

  it('counts a line that holds only a closing bracket', () => {
    expect(countCodeLines('f(\n  1,\n  2\n);\nconst o = {\n  a: 1,\n};\n')).toBe(7);
  });

  it('counts nothing in an empty or comment-only file', () => {
    expect(countCodeLines('')).toBe(0);
    expect(countCodeLines('// only\n/** doc */\n')).toBe(0);
  });
});
