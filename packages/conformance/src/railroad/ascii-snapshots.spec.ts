import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from '../index.ts';

// Railroad text output snapshots (#617, D518): two e2e fixtures per notation, each in both
// charsets, through the public `format: 'ascii'` API. The files sit under
// `__snapshots__/ascii/` (`vitest -u` writes them; review the drawing before committing).

const FIXTURES = [
  'baseline/ir/default',
  'pr-check/ir-sequences-and-choices',
  'baseline/ebnf/default',
  'pr-check/ebnf-iso-14977-notation',
  'baseline/abnf/default',
  'pr-check/abnf-alternation-and-repetition',
  'baseline/peg/default',
  'pr-check/peg-ordered-choice-and-suffixes',
] as const;

const CHARSETS = ['unicode', 'ascii'] as const;

describe('railroad text output snapshots (D518)', () => {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  const cases = FIXTURES.flatMap((f) => CHARSETS.map((charset) => [f, charset] as const));

  it.each(cases)('%s in %s', async (fixture, charset) => {
    const source = readFileSync(join(REPO_ROOT, 'e2e/diagrams/railroad', `${fixture}.mmd`), 'utf8');
    const out = await m.render('mermaid-0', source, {
      format: 'ascii',
      config: { ascii: { charset } },
    });
    const name = `${fixture.replace(/\//g, '-')}.${charset}.txt`;
    await expect(`${out.text}\n`).toMatchFileSnapshot(join('__snapshots__', 'ascii', name));
  });
});
