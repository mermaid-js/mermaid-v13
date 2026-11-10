/**
 * The e2e fixture discovery lives here; `e2e/helpers/mmd-snapshots.ts` re-exports it, and its
 * spec covers the discovery rules.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { supportsFormat } from 'mermaid';
import {
  DIAGRAMS_DIR,
  FIXTURE_FOLDER_TYPES,
  supportedFixtureFolders,
  supportedTypesOf,
} from './fixture-discovery.ts';
import { REPO_ROOT } from './fixtures.ts';

const SUPPORTED_TYPES = supportedTypesOf((type) => supportsFormat(type, 'svg'));
/**
 * The first fixture folder none of whose types has a v13 package yet, so these checks follow the
 * ports as they land; when the last one lands there is none, and this throws.
 */
const UNPORTED = (() => {
  const entry = Object.entries(FIXTURE_FOLDER_TYPES).find(
    ([, types]) => types.length > 0 && types.every((t) => !supportsFormat(t, 'svg'))
  );
  if (!entry) throw new Error('Every fixture folder has a v13 package: no unported folder left.');
  return { folder: entry[0], type: entry[1][0]! };
})();

describe('fixture discovery', () => {
  it('knows which diagram types have a v13 package', () => {
    expect(SUPPORTED_TYPES.has('flowchart-v2')).toBe(true);
    expect(SUPPORTED_TYPES.has('pie')).toBe(true);
    expect(SUPPORTED_TYPES.has('gantt')).toBe(true);
    expect(SUPPORTED_TYPES.has(UNPORTED.type)).toBe(false);
  });

  it('lists the supported folders of the e2e root', () => {
    const folders = supportedFixtureFolders({
      diagramsDir: join(REPO_ROOT, DIAGRAMS_DIR),
      supportedTypes: SUPPORTED_TYPES,
    });
    expect(folders).toContain('flowchart');
    expect(folders).toContain('pie');
    expect(folders).toContain('gantt');
    expect(folders).not.toContain(UNPORTED.folder);
  });
});
