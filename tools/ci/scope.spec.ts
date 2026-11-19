import { describe, expect, it } from 'vitest';
import { ciScope, summarize } from './scope.ts';

const docs = ['v13/docs/DECISIONS.md'];

describe('ciScope', () => {
  it('checks everything when a changed file is not documentation', () => {
    const result = ciScope({
      event: 'pull_request',
      files: [...docs, 'packages/core/src/svg/writer.ts'],
      readers: [],
    });
    expect(result.scope).toBe('code');
    expect(result.reason).toContain('packages/core/src/svg/writer.ts');
  });

  it('counts Markdown that lives with code as code, as the pre-push hook does', () => {
    for (const file of [
      '.changeset/quiet-cats.md',
      'e2e/diagrams/flowchart/pr-check/readme.md',
      'packages/core/src/theme/notes.md',
      'v13/docs/tools/build.ts',
    ]) {
      expect(ciScope({ event: 'push', files: [file], readers: [] }).scope, file).toBe('code');
    }
  });

  it('is a docs run when every file is documentation that no code reads', () => {
    const result = ciScope({
      event: 'pull_request',
      files: ['README.md', 'docs/a.png'],
      readers: [],
    });
    expect(result).toMatchObject({ scope: 'docs', readers: [] });
    expect(result.reason).toContain('2 files changed');
  });

  it('names the code that reads a changed docs file, specs or not, sorted', () => {
    const result = ciScope({
      event: 'push',
      files: docs,
      readers: ['packages/dev/src/b.spec.ts', 'packages/conformance/src/allowlists/allowlists.ts'],
    });
    expect(result.scope).toBe('docs');
    expect(result.readers).toEqual([
      'packages/conformance/src/allowlists/allowlists.ts',
      'packages/dev/src/b.spec.ts',
    ]);
    expect(result.reason).toContain('2 source files read them');
  });

  it('checks everything on any doubt: another event, no file list, a failed search', () => {
    for (const event of ['merge_group', 'workflow_dispatch', 'schedule']) {
      expect(ciScope({ event, files: docs, readers: [] }).scope, event).toBe('code');
    }
    expect(ciScope({ event: 'push', files: undefined, readers: [] }).scope).toBe('code');
    expect(ciScope({ event: 'push', files: [], readers: [] }).scope).toBe('code');
    expect(ciScope({ event: 'push', files: docs, readers: undefined }).scope).toBe('code');
  });
});

describe('summarize', () => {
  it('names the scope, the reason and the specs', () => {
    const text = summarize(ciScope({ event: 'push', files: docs, readers: ['a/b.spec.ts'] }));
    expect(text).toContain('### CI scope: docs');
    expect(text).toContain('1 file changed');
    expect(text).toContain('- `a/b.spec.ts`');
  });
});
