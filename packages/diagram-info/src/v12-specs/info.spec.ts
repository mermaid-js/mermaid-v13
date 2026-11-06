/**
 * v12's info specs, ported (`packages/mermaid/src/diagrams/info/info.spec.ts` and
 * `packages/parser/tests/info.test.ts` at `fa796a943`). v12 asserted its parser resolved or
 * threw; here a parse is accepted when it has no error diagnostic. The rejection message is
 * v13's (MIGRATION.md: error messages are new), so only the place is checked: v12's lexer error
 * was at offset 5, the start of `unsupported`.
 */
import { describe, expect, it } from 'vitest';
import { parseInfo } from '../parser/index.ts';

const errors = (src: string) => parseInfo(src).diagnostics.filter((d) => d.severity === 'error');

describe('info (v12 info.spec.ts)', () => {
  it('should handle an info definition', () => {
    expect(errors(`info`)).toEqual([]);
  });

  it('should handle an info definition with showInfo', () => {
    expect(errors(`info showInfo`)).toEqual([]);
  });

  it('should throw because of unsupported info grammar', () => {
    const [d, ...rest] = errors(`info unsupported`);
    expect(rest).toEqual([]);
    expect(d?.range.start).toBe(5);
  });
});

describe('info (v12 parser info.test.ts)', () => {
  it.each([`info`, `\n    info`, `info\n    `, `\n    info\n    `])(
    'should handle empty info',
    (context) => {
      expect(errors(context)).toEqual([]);
      expect(parseInfo(context).model.showInfo).toBe(false);
    }
  );

  it.each([
    `info showInfo`,
    `info showInfo\n    `,
    `\n    info showInfo`,
    `info\n    showInfo`,
    `info\n    showInfo\n    `,
    `\n    info\n    showInfo\n    `,
    `\n    info\n    showInfo`,
    `\n    info showInfo\n    `,
  ])('should handle showInfo', (context) => {
    expect(errors(context)).toEqual([]);
    expect(parseInfo(context).model.showInfo).toBe(true);
  });
});
