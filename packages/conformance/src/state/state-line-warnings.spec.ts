import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../corpus.ts';
import { parseState } from '@mermaid-js/diagram-state';

// #362, D609: the fixtures that hold `state X: description` lines give one warning per line.
const DIR = 'e2e/diagrams/state-diagram-v2/nightly-check';
const FIXTURES = ['neo', 'neo-dark', 'redux', 'redux-dark'].map(
  (t) => `${DIR}/states-with-descriptions-neo-look-${t}-theme.mmd`
);

describe('`state X: description` fixtures (#362)', () => {
  it.each(FIXTURES)('%s gives one warning per `state` line', (file) => {
    const src = readFileSync(join(REPO_ROOT, file), 'utf8');
    const warnings = parseState(src).diagnostics.filter((d) => d.severity === 'warning');
    expect(warnings.map((d) => [d.code, src.slice(d.range.start, d.range.end)])).toEqual(
      [1, 2, 3, 4].map((n) => ['STATE_NOT_DRAWN', `state State${n}: Description ${n}`])
    );
  });
});
