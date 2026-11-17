import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../corpus.ts';
import { describeC4AsciiProperties } from '../ascii/c4-properties.ts';
import { c4betaCorpus } from './corpus.ts';

// ASCII render properties of c4-beta (spec #730 T7, R-ASCII-9) over the accepted sources of the
// probes, the grammar's documents (each with its generated variants) and `e2e/diagrams/c4beta`,
// in both charsets: the properties legacy C4's text output passes (`../c4/ascii-properties.ts`).
const FIXTURES = join(REPO_ROOT, 'e2e/diagrams/c4beta');

describeC4AsciiProperties(
  'c4-beta ascii corpus properties (spec #730 T7, R-ASCII-9)',
  async () => [
    ...c4betaCorpus(),
    ...readdirSync(FIXTURES, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.mmd'))
      .map((f) => ({ id: `e2e/${f}`, source: readFileSync(join(FIXTURES, f), 'utf8') })),
  ],
  100
);
