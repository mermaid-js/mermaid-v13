import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { JISON_TYPES, LEXICAL_ERROR, loadJisonLexerOracle } from './oracle.ts';
import type { JisonType } from './oracle.ts';

/**
 * The M4 and M5 jison types load into the shared oracle before their v13 lexers exist (D212):
 * v12 lexes every e2e fixture of the type to the end, and every token decodes to a terminal
 * name.
 */
const LATER: JisonType[] = ['gantt', 'mindmap', 'timeline', 'journey', 'quadrant', 'kanban'];

describe.each(LATER)('%s through the shared jison oracle', (type) => {
  it('lexes the e2e fixtures', async () => {
    const oracle = await loadJisonLexerOracle(type);
    const problems: string[] = [];
    let fixtures = 0;
    for (const dir of JISON_TYPES[type].e2e) {
      for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams', dir), dir)) {
        fixtures++;
        const tokens = await oracle.tokens(item.source);
        if (!tokens) problems.push(`${item.id}: not lexed by v12's ${type} lexer`);
        else if (tokens.length === 0) problems.push(`${item.id}: no tokens`);
        else if (tokens.some(([name]) => name === LEXICAL_ERROR || /^\d+$/.test(name)))
          problems.push(`${item.id}: ${JSON.stringify(tokens.slice(-3))}`);
      }
    }
    expect(fixtures).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  }, 60_000);
});
