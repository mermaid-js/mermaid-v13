import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MermaidError } from 'mermaid';
import { renderC4Ascii, type C4Charset } from '../c4/ascii-render.ts';
import { c4betaSources } from './corpus.ts';

// c4-beta's reviewed text drawings (spec #730 T7, D83): every probe and grammar document the
// parser accepts, drawn in both charsets and compared exactly with
// `ascii/c4beta/<name>/expected.txt` (Unicode) and `expected.ascii.txt`. They have no upstream
// file: the c4-beta source is the probe itself (`./cases`, `packages/diagram-c4/grammar`). A
// rejected source has no folder, and no folder stands without its source. Write them with
// `vitest run -u packages/conformance/src/c4beta/ascii-goldens.spec.ts` and review the diff.
const ROOT = fileURLToPath(new URL('../../ascii/c4beta/', import.meta.url));
const FILES = { unicode: 'expected.txt', ascii: 'expected.ascii.txt' } as const;

const sources = c4betaSources().map(({ id, source }) => ({
  name: id.replace(/\.mmd$/, ''),
  source,
}));

describe('c4-beta ascii goldens (spec #730 T7)', () => {
  it.each(sources.map((s) => [s.name, s] as const))('%s', async (_, { name, source }) => {
    const dir = join(ROOT, name);
    try {
      await renderC4Ascii(source, 'unicode');
    } catch (e) {
      if (!(e instanceof MermaidError)) throw e;
      expect(existsSync(dir), `${name} is rejected: no golden folder`).toBe(false);
      return;
    }
    for (const charset of Object.keys(FILES) as C4Charset[]) {
      const { text } = await renderC4Ascii(source, charset);
      await expect(text).toMatchFileSnapshot(join(dir, FILES[charset]));
    }
  });

  it('has a folder for every accepted source and no other', () => {
    const folders = existsSync(ROOT) ? readdirSync(ROOT).sort() : [];
    expect(folders.every((f) => sources.some((s) => s.name === f))).toBe(true);
    for (const f of folders)
      expect(readdirSync(join(ROOT, f)).sort()).toEqual(Object.values(FILES).sort());
  });
});
