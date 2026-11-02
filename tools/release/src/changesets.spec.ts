import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ensureChangeset, pendingChangesets } from './changesets.ts';

function changesetDir(files: Record<string, string>, consumed: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'changesets-'));
  mkdirSync(join(root, '.changeset'));
  writeFileSync(join(root, '.changeset', 'config.json'), '{}');
  writeFileSync(join(root, '.changeset', 'README.md'), '# Changesets');
  writeFileSync(
    join(root, '.changeset', 'pre.json'),
    JSON.stringify({ mode: 'pre', tag: 'alpha', initialVersions: {}, changesets: consumed })
  );
  for (const [name, body] of Object.entries(files))
    writeFileSync(join(root, '.changeset', name), body);
  return root;
}

const bump = "---\n'mermaid': patch\n---\n\nfix: x\n";

describe('changesets for every merge (R-REL-2)', () => {
  it('counts only changesets that pre mode has not consumed yet', () => {
    const root = changesetDir({ 'old-one.md': bump, 'new-one.md': bump }, ['old-one']);
    expect(pendingChangesets(root)).toEqual(['new-one']);
  });

  it('adds a mermaid patch changeset when a merge brought none, so it still gets an alpha', () => {
    const root = changesetDir({ 'old-one.md': bump }, ['old-one']);
    expect(ensureChangeset(root, '0123456789abcdef')).toBe('alpha-0123456789ab');
    expect(pendingChangesets(root)).toEqual(['alpha-0123456789ab']);
    expect(readFileSync(join(root, '.changeset', 'alpha-0123456789ab.md'), 'utf8')).toBe(
      "---\n'mermaid': patch\n---\n\nchore: alpha build of 0123456789ab\n"
    );
  });

  it('leaves a merge that has its own changeset alone', () => {
    const root = changesetDir({ 'feat-x.md': bump }, []);
    expect(ensureChangeset(root, 'abc')).toBeUndefined();
    expect(readdirSync(join(root, '.changeset')).sort()).toEqual([
      'README.md',
      'config.json',
      'feat-x.md',
      'pre.json',
    ]);
  });

  it('refuses to run outside pre mode, where a patch would publish a stable release', () => {
    const root = changesetDir({}, []);
    writeFileSync(
      join(root, '.changeset', 'pre.json'),
      JSON.stringify({ mode: 'exit', tag: 'alpha', changesets: [] })
    );
    expect(() => ensureChangeset(root, 'abc')).toThrow(/pre mode/);
  });
});
