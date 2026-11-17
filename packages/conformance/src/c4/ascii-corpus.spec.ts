import { c4Cases, c4Corpus } from './corpus.ts';
import { describeC4AsciiProperties } from '../ascii/c4-properties.ts';

// ASCII render properties of C4 (#545, D459, R-ASCII-9) over the C4 corpus: e2e fixtures, v12
// spec and syntax-page strings, the cases file. The properties are in `ascii-properties.ts`,
// which the c4-beta suite runs over its own corpus.
describeC4AsciiProperties(
  'c4 ascii corpus properties (#545, D459, R-ASCII-9)',
  async () => [...(await c4Corpus()), ...c4Cases()],
  100
);
