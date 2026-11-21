/**
 * The manifest loader's two helpers that the language server and the bundler plugin share
 * (C-129): picking a detector module's function, and an import under a time limit.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectorOf, importWithin } from './index.ts';

describe('detectorOf', () => {
  const fn = (): boolean => true;

  it('takes the `detector` export, else the default export', () => {
    expect(detectorOf({ detector: fn, default: () => false })).toBe(fn);
    expect(detectorOf({ default: fn })).toBe(fn);
  });

  it('gives undefined for a module without a function', () => {
    expect(detectorOf({ detector: 'yes' })).toBeUndefined();
    expect(detectorOf({})).toBeUndefined();
    expect(detectorOf(null)).toBeUndefined();
  });
});

describe('importWithin', () => {
  const dir = mkdtempSync(join(tmpdir(), 'autoload-load-'));

  it('imports a file by its path', async () => {
    const file = join(dir, 'ok.mjs');
    writeFileSync(file, 'export const value = 42;\n');
    await expect(importWithin(file, 5000)).resolves.toMatchObject({ value: 42 });
  });

  it('rejects when the import takes longer than the limit', async () => {
    const file = join(dir, 'slow.mjs');
    writeFileSync(file, 'await new Promise((r) => setTimeout(r, 200));\n');
    await expect(importWithin(file, 1)).rejects.toThrow('timed out after 1 ms');
  });
});
