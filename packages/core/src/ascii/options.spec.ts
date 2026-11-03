import { describe, expect, it } from 'vitest';
import { asciiOptions } from './options.ts';

describe('asciiOptions (DESIGN §6.3)', () => {
  it.each([
    [{}, undefined, { charset: 'unicode', padding: 'compact', maxWidth: undefined }],
    [
      { ascii: { charset: 'ascii', padding: 'roomy', maxWidth: 40.7 } },
      undefined,
      { charset: 'ascii', padding: 'roomy', maxWidth: 40 },
    ],
    [
      { ascii: { charset: 'ebcdic', padding: 'huge', maxWidth: 0 } },
      undefined,
      { charset: 'unicode', padding: 'compact', maxWidth: undefined },
    ],
    [
      { ascii: { maxWidth: '40' } },
      undefined,
      { charset: 'unicode', padding: 'compact', maxWidth: undefined },
    ],
    [{ ascii: null }, undefined, { charset: 'unicode', padding: 'compact', maxWidth: undefined }],
    // Explicit options win key by key; unset ones fall back to the config.
    [
      { ascii: { charset: 'unicode', padding: 'roomy', maxWidth: 5 } },
      { charset: 'ascii', maxWidth: 80 },
      { charset: 'ascii', padding: 'roomy', maxWidth: 80 },
    ],
    [
      { ascii: { charset: 'ascii' } },
      { charset: undefined },
      { charset: 'ascii', padding: 'compact', maxWidth: undefined },
    ],
  ])('%j with %j → %j', (config, explicit, want) => {
    expect(asciiOptions(config, explicit)).toEqual(want);
  });
});
