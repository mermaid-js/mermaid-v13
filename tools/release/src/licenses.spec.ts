import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkLicenses } from './licenses.ts';

const MIT_NOTICE = `Pele
----
Ported from Pele, https://github.com/obsidianmd/pele, under the MIT License:

MIT License

Copyright (c) 2026 kepano
`;

const GOOD_HEADER =
  '// Ported from Pele (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano), src/x.ts.\n';

/** Writes `files` (path → content) under a fresh directory and returns it. */
function workspace(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'licenses-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const manifest = (extra: object = {}) =>
  JSON.stringify({ name: '@mermaid-js/core', files: ['dist', 'THIRD_PARTY_NOTICES'], ...extra });

describe('license check (R-REL-4)', () => {
  it('passes when every ported file has an MIT header and is listed in the notices', () => {
    const root = workspace({
      'packages/core/package.json': manifest(),
      'packages/core/THIRD_PARTY_NOTICES': `${MIT_NOTICE}\nFiles:\n  src/layout/a.ts\n`,
      'packages/core/src/layout/a.ts': `${GOOD_HEADER}export const a = 1;\n`,
      'packages/core/src/other.ts': '// Not from Pele.\nexport const b = 2;\n',
    });
    expect(checkLicenses(root)).toEqual([]);
  });

  it('reports a ported file whose header lacks the MIT attribution', () => {
    const root = workspace({
      'packages/core/package.json': manifest(),
      'packages/core/THIRD_PARTY_NOTICES': `${MIT_NOTICE}\n  src/a.ts\n`,
      'packages/core/src/a.ts':
        '// Ported from Pele (https://github.com/obsidianmd/pele), src/a.ts.\nexport {};\n',
    });
    expect(checkLicenses(root)).toEqual([
      'packages/core/src/a.ts: Pele-derived header must name the MIT license and "kepano"',
    ]);
  });

  it('reports a ported file that the package notices do not list', () => {
    const root = workspace({
      'packages/core/package.json': manifest(),
      'packages/core/THIRD_PARTY_NOTICES': MIT_NOTICE,
      'packages/core/src/a.ts': `/**\n * Doc.\n${GOOD_HEADER.replace('//', ' *')} */\nexport {};\n`,
    });
    expect(checkLicenses(root)).toEqual([
      'packages/core/src/a.ts: not listed in packages/core/THIRD_PARTY_NOTICES',
    ]);
  });

  it('requires a THIRD_PARTY_NOTICES with the MIT text that the package publishes', () => {
    const missing = workspace({
      'packages/flow/package.json': JSON.stringify({ name: 'flow', files: ['dist'] }),
      'packages/flow/src/a.ts': `${GOOD_HEADER}export {};\n`,
    });
    expect(checkLicenses(missing)).toEqual([
      'packages/flow: has Pele-derived files but no THIRD_PARTY_NOTICES',
    ]);

    const unpublished = workspace({
      'packages/flow/package.json': JSON.stringify({ name: 'flow', files: ['dist'] }),
      'packages/flow/THIRD_PARTY_NOTICES': 'Pele\n  src/a.ts\n',
      'packages/flow/src/a.ts': `${GOOD_HEADER}export {};\n`,
    });
    expect(checkLicenses(unpublished)).toEqual([
      'packages/flow/THIRD_PARTY_NOTICES: must contain the MIT License text with "Copyright (c) 2026 kepano"',
      'packages/flow/package.json: "files" must include THIRD_PARTY_NOTICES',
    ]);
  });

  it('reports notice entries for files that no longer exist', () => {
    const root = workspace({
      'packages/core/package.json': manifest(),
      'packages/core/THIRD_PARTY_NOTICES': `${MIT_NOTICE}\n  src/a.ts\n  src/gone.ts\n`,
      'packages/core/src/a.ts': `${GOOD_HEADER}export {};\n`,
    });
    expect(checkLicenses(root)).toEqual([
      'packages/core/THIRD_PARTY_NOTICES: lists src/gone.ts, which does not exist',
    ]);
  });

  it('ignores Pele links outside the file header, spec files and private packages', () => {
    const root = workspace({
      'packages/core/package.json': manifest(),
      'packages/core/src/a.ts':
        'export const a = 1;\n// see https://github.com/obsidianmd/pele for the idea\n',
      'packages/core/src/a.spec.ts': '// https://github.com/obsidianmd/pele\n',
      'packages/bench/package.json': JSON.stringify({ name: 'bench', private: true }),
      'packages/bench/src/b.ts': '// https://github.com/obsidianmd/pele\n',
    });
    expect(checkLicenses(root)).toEqual([]);
  });

  it('checks headers (not notices) of ported tools', () => {
    const root = workspace({
      'tools/gen/src/a.ts': '// Ported from https://github.com/obsidianmd/pele.\n',
    });
    expect(checkLicenses(root)).toEqual([
      'tools/gen/src/a.ts: Pele-derived header must name the MIT license and "kepano"',
    ]);
  });

  it('passes on this repository', () => {
    expect(checkLicenses(join(import.meta.dirname, '..', '..', '..'))).toEqual([]);
  });
});
