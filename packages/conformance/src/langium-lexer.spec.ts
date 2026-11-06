import { describe, expect, it } from 'vitest';
import { langiumParserVersions, loadLangiumLexerOracle } from './langium-lexer.ts';

describe('the Langium lexer oracle (D213, D220)', () => {
  it('pins the @mermaid-js/parser that mermaid@12.2.0 resolves, exactly', () => {
    const { alias, v12 } = langiumParserVersions();
    expect(alias.specifier).toBe(`npm:@mermaid-js/parser@${v12.version}`);
    expect(alias.version).toBe(v12.version);
    // One package, not two copies of one version.
    expect(alias.dir).toBe(v12.dir);
  });

  it('lexes the text v12 parsed: comment lines cut, CRLF as LF, entities encoded', async () => {
    const oracle = await loadLangiumLexerOracle('pie');
    const lexed = await oracle.lex('%% c\r\npie title a #quot; %% t\r\n  "x": 1');
    expect(lexed?.input).toBe('pie title a ﬂ°quot¶ß %% t\n  "x": 1\n');
    expect(lexed?.tokens).toEqual([
      ['pie', 'pie'],
      ['TITLE', ' title a ﬂ°quot¶ß '],
      ['NEWLINE', '\n'],
      ['STRING', '"x"'],
      [':', ':'],
      ['NUMBER_PIE', '1'],
      // v12's appended `\n`, clipped.
      ['NEWLINE', ''],
    ]);
    expect(lexed?.hidden).toEqual([['SINGLE_LINE_COMMENT', '%% t']]);
    expect(lexed?.errorAt).toBeUndefined();
  });

  it('stops both lists at the first lexer error', async () => {
    const oracle = await loadLangiumLexerOracle('pie');
    expect(oracle.lexText('pie\n"a": 12. %% x\n"b": 1')).toEqual({
      input: 'pie\n"a": 12. %% x\n"b": 1',
      tokens: [
        ['pie', 'pie'],
        ['NEWLINE', '\n'],
        ['STRING', '"a"'],
        [':', ':'],
        ['NUMBER_PIE', '1'],
      ],
      hidden: [],
      errorAt: 10,
    });
  });

  it('gives undefined for a source v12 does not parse as the type', async () => {
    const oracle = await loadLangiumLexerOracle('pie');
    expect(await oracle.lex('flowchart LR\n  A')).toBeUndefined();
  });
});
