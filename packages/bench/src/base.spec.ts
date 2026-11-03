import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractBase, resolveRef } from './base.ts';

describe('v13-base source tree', () => {
  it('names the ref when it is not a commit', () => {
    expect(() => resolveRef('no-such-branch-for-the-bench')).toThrow(
      /base ref "no-such-branch-for-the-bench" is not a commit/
    );
  });

  it('writes the commit out with its workspace packages linked inside it', () => {
    const tree = extractBase('HEAD');
    expect(tree.sha).toBe(resolveRef('HEAD'));
    expect(tree.version).toMatch(new RegExp(`\\(${tree.sha.slice(0, 9)}\\)$`));
    expect(existsSync(tree.entry)).toBe(true);
    // `mermaid` and `@mermaid-js/*` resolve to the extracted packages, not the working tree's.
    expect(realpathSync(join(tree.dir, 'node_modules', '@mermaid-js', 'core'))).toBe(
      realpathSync(join(tree.dir, 'packages', 'core'))
    );
    expect(realpathSync(join(tree.dir, 'node_modules', 'mermaid'))).toBe(
      realpathSync(join(tree.dir, 'packages', 'mermaid'))
    );
    // A second call reuses the tree.
    expect(extractBase('HEAD').dir).toBe(tree.dir);
  });
});
