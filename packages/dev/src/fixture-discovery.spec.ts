/**
 * The e2e fixture discovery lives here; `e2e/helpers/mmd-snapshots.ts` re-exports it, and its
 * spec covers the discovery rules.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { supportsFormat } from 'mermaid';
import { DIAGRAMS_DIR, supportedFixtureFolders, supportedTypesOf } from './fixture-discovery.ts';
import { REPO_ROOT } from './fixtures.ts';

const SUPPORTED_TYPES = supportedTypesOf((type) => supportsFormat(type, 'svg'));

describe('fixture discovery', () => {
  it('knows which diagram types have a v13 package', () => {
    expect(SUPPORTED_TYPES.has('flowchart-v2')).toBe(true);
    expect(SUPPORTED_TYPES.has('pie')).toBe(true);
    expect(SUPPORTED_TYPES.has('gantt')).toBe(false);
  });

  it('lists the supported folders of the e2e root', () => {
    const folders = supportedFixtureFolders({
      diagramsDir: join(REPO_ROOT, DIAGRAMS_DIR),
      supportedTypes: SUPPORTED_TYPES,
    });
    expect(folders).toContain('flowchart');
    expect(folders).toContain('pie');
    expect(folders).not.toContain('gantt');
  });
});
