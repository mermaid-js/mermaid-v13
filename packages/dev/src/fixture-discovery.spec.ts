/**
 * The e2e fixture discovery lives here (the explorer lists what the snapshot run renders);
 * `e2e/helpers/mmd-snapshots.ts` re-exports it, and its spec covers the discovery rules.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_EXPLORER_ROOT } from './explorer.ts';
import { supportsFormat } from 'mermaid';
import { supportedFixtureFolders, supportedTypesOf } from './fixture-discovery.ts';

const SUPPORTED_TYPES = supportedTypesOf((type) => supportsFormat(type, 'svg'));

describe('fixture discovery', () => {
  it('knows which diagram types have a v13 package', () => {
    expect(SUPPORTED_TYPES.has('flowchart-v2')).toBe(true);
    expect(SUPPORTED_TYPES.has('pie')).toBe(false);
  });

  it('lists the supported folders of the e2e root', () => {
    const folders = supportedFixtureFolders({
      diagramsDir: DEFAULT_EXPLORER_ROOT,
      supportedTypes: SUPPORTED_TYPES,
    });
    expect(folders).toContain('flowchart');
    expect(folders).not.toContain('pie');
  });
});
