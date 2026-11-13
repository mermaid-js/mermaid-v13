import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { JISON_TYPES, LEXICAL_ERROR, loadJisonLexerOracle } from './oracle.ts';
import type { JisonType } from './oracle.ts';

/**
 * The jison types after M3 load into the shared oracle before their v13 lexers exist (D212):
 * v12 lexes every e2e fixture of the type to the end, and every token decodes to a terminal
 * name. Every row of `JISON_TYPES` is smoke-tested unless it says `smoke: false` (the M3 types).
 * A fixture v12 rejects before its lexer runs is listed in its type's `notLexed`, and must stay
 * unlexed; one v12's lexer stops on with an error where v13 accepts it on purpose is listed in
 * `lexErrors`, and must still stop there.
 */
const SMOKED: JisonType[] = Object.keys(JISON_TYPES).filter((t) => JISON_TYPES[t]!.smoke !== false);

it('smoke-tests the jison types after M3', () => {
  expect(SMOKED.length).toBeGreaterThan(0);
});

describe.each(SMOKED)('%s through the shared jison oracle', (type) => {
  it('lexes the e2e fixtures', async () => {
    const oracle = await loadJisonLexerOracle(type);
    const problems: string[] = [];
    let fixtures = 0;
    const { e2e, notLexed = [], lexErrors = {} } = JISON_TYPES[type]!;
    const unlexed = new Set(notLexed);
    const failing = new Set(Object.keys(lexErrors));
    for (const dir of e2e) {
      for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams', dir), dir)) {
        fixtures++;
        const tokens = await oracle.tokens(item.source);
        if (unlexed.delete(item.id)) {
          if (tokens) problems.push(`${item.id}: lexed by v12, remove it from notLexed`);
        } else if (!tokens) problems.push(`${item.id}: not lexed by v12's ${type} lexer`);
        else if (tokens.length === 0) problems.push(`${item.id}: no tokens`);
        else if (failing.delete(item.id)) {
          if (!tokens.some(([name]) => name === LEXICAL_ERROR))
            problems.push(`${item.id}: lexed by v12 to the end, remove it from lexErrors`);
        } else if (tokens.some(([name]) => name === LEXICAL_ERROR || /^\d+$/.test(name)))
          problems.push(`${item.id}: ${JSON.stringify(tokens.slice(-3))}`);
      }
    }
    expect(fixtures).toBeGreaterThan(0);
    expect([...unlexed], 'notLexed ids that are no fixture').toEqual([]);
    expect([...failing], 'lexErrors ids that are no fixture').toEqual([]);
    expect(problems).toEqual([]);
  }, 60_000);
});
