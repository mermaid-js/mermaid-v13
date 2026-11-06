import { describe, expect, it } from 'vitest';
import { LEXICAL_ERROR, loadJisonLexerOracle } from './oracle.ts';

/**
 * The shared jison lexer oracle (D212): v12's own lexer for a type, run on the text v12's
 * parser received, with the `\n` v12 appended taken off the image of the token that matched it.
 */
describe('jison lexer oracle', () => {
  it('takes the appended line break off the token that matched it', async () => {
    const oracle = await loadJisonLexerOracle('flowchart');
    expect(await oracle.lexedText('flowchart LR\nA')).toBe('flowchart LR\nA\n');
    expect(await oracle.tokens('flowchart LR\nA')).toEqual([
      ['GRAPH', 'flowchart'],
      ['DIR', ' LR'],
      ['NEWLINE', '\n'],
      ['NODE_STRING', 'A'],
      ['NEWLINE', ''],
      ['EOF', ''],
    ]);
  });

  it('clips nothing when a skipped blank run swallowed the appended line break', async () => {
    const oracle = await loadJisonLexerOracle('flowchart');
    // `"click"[\s]+` matches `\n\n` and returns no token: the line break after `A` is the
    // source's own and keeps its image. (Flowchart's own copy took it off, #212 §4.)
    const tokens = await oracle.tokens('flowchart LR\nA\nclick\n');
    expect(tokens?.slice(2)).toEqual([
      ['NEWLINE', '\n'],
      ['NODE_STRING', 'A'],
      ['NEWLINE', '\n'],
      ['CLICK', ''],
    ]);
  });

  it('keeps the appended line break when asked to', async () => {
    const oracle = await loadJisonLexerOracle('flowchart');
    const tokens = await oracle.tokens('flowchart LR\nA', { keepAppendedNewline: true });
    expect(tokens?.at(-2)).toEqual(['NEWLINE', '\n']);
  });

  it('ends the stream at a lexical error', async () => {
    const oracle = await loadJisonLexerOracle('flowchart');
    // No flowchart rule matches `§` outside a label.
    const tokens = await oracle.tokens('flowchart LR\nA§');
    expect(tokens?.slice(-2)).toEqual([
      ['NODE_STRING', 'A'],
      [LEXICAL_ERROR, ''],
    ]);
    expect(oracle.LEXICAL_ERROR).toBe(LEXICAL_ERROR);
  });

  it('returns undefined when v12 never ran that type’s lexer', async () => {
    const oracle = await loadJisonLexerOracle('class');
    expect(await oracle.tokens('erDiagram\nA')).toBeUndefined();
    expect(await oracle.lexedText('erDiagram\nA')).toBeUndefined();
  });
});
