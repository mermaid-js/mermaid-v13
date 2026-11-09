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
      'packages/flow: has files ported from Pele but no THIRD_PARTY_NOTICES',
    ]);
    // It names the upstreams the files come from.
    const iconifyOnly = workspace({
      'packages/icons/package.json': JSON.stringify({ name: 'icons', files: ['dist'] }),
      'packages/icons/src/a.ts':
        '// Ported from Iconify (https://github.com/iconify/iconify, MIT License, Copyright (c) 2021-PRESENT Vjacheslav Trushkin).\nexport {};\n',
    });
    expect(checkLicenses(iconifyOnly)).toEqual([
      'packages/icons: has files ported from @iconify/utils but no THIRD_PARTY_NOTICES',
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

  it('accepts notices for a third-party dependency in a package with no ported files', () => {
    const root = workspace({
      'packages/layout/package.json': JSON.stringify({
        name: 'layout',
        files: ['dist', 'THIRD_PARTY_NOTICES'],
        dependencies: { elkjs: '0.12.0' },
      }),
      'packages/layout/THIRD_PARTY_NOTICES': 'elkjs\n-----\nEPL-2.0 OR GPL-3.0-or-later\n',
      'packages/layout/src/a.ts': '// Our own code.\nexport {};\n',
    });
    expect(checkLicenses(root)).toEqual([]);
  });

  it('accepts notices for third-party code the package bundles into its build', () => {
    const root = workspace({
      'packages/math/package.json': JSON.stringify({
        name: 'math',
        files: ['dist', 'THIRD_PARTY_NOTICES'],
        devDependencies: { '@mathjax/src': '4.1.3' },
      }),
      'packages/math/THIRD_PARTY_NOTICES': '@mathjax/src\n------------\nApache-2.0\n',
      'packages/math/src/a.ts': '// Our own code.\nexport {};\n',
    });
    expect(checkLicenses(root)).toEqual([]);
  });

  it('still requires the Pele text in notices that credit no runtime dependency', () => {
    const root = workspace({
      'packages/layout/package.json': JSON.stringify({
        name: 'layout',
        files: ['dist', 'THIRD_PARTY_NOTICES'],
        dependencies: { elkjs: '0.12.0' },
      }),
      'packages/layout/THIRD_PARTY_NOTICES': 'Some notes\n',
      'packages/layout/src/a.ts': '// Our own code.\nexport {};\n',
    });
    expect(checkLicenses(root)).toEqual([
      'packages/layout/THIRD_PARTY_NOTICES: must contain the MIT License text with "Copyright (c) 2026 kepano"',
    ]);
  });

  it('needs no Pele text when every ported file comes from another upstream', () => {
    const header =
      '// Ported from Iconify (https://github.com/iconify/iconify, MIT License, Copyright (c) 2021-PRESENT Vjacheslav Trushkin).\n';
    const iconify =
      '@iconify/utils\n--------------\n  src/a.ts\n\nMIT License\n\nCopyright (c) 2021-PRESENT Vjacheslav Trushkin\n';
    const files = {
      'packages/icons/package.json': JSON.stringify({
        name: 'icons',
        files: ['dist', 'THIRD_PARTY_NOTICES'],
      }),
      'packages/icons/src/a.ts': `${header}export {};\n`,
    };
    expect(
      checkLicenses(workspace({ ...files, 'packages/icons/THIRD_PARTY_NOTICES': iconify }))
    ).toEqual([]);
    expect(
      checkLicenses(workspace({ ...files, 'packages/icons/THIRD_PARTY_NOTICES': 'MIT License\n' }))
    ).toEqual([
      'packages/icons/THIRD_PARTY_NOTICES: must contain the MIT License text with "Copyright (c) 2021-PRESENT Vjacheslav Trushkin"',
      'packages/icons/src/a.ts: not listed under @iconify/utils in packages/icons/THIRD_PARTY_NOTICES',
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

  it('requires the upstream notice and listing for a file ported from @braintree/sanitize-url', () => {
    const header =
      '// Port of @braintree/sanitize-url (MIT, (c) 2017 Braintree) via Pele (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano).\n';
    const braintree = `@braintree/sanitize-url\n-----------------------\nMIT License\n\nCopyright (c) 2017 Braintree\n`;
    const files = {
      'packages/core/package.json': manifest(),
      'packages/core/src/svg/url.ts': `${header}export {};\n`,
    };
    expect(
      checkLicenses(
        workspace({
          ...files,
          'packages/core/THIRD_PARTY_NOTICES': `${MIT_NOTICE}\n  src/svg/url.ts\n`,
        })
      )
    ).toEqual([
      'packages/core/THIRD_PARTY_NOTICES: must contain the MIT License text with "Copyright (c) 2017 Braintree"',
      'packages/core/src/svg/url.ts: not listed under @braintree/sanitize-url in packages/core/THIRD_PARTY_NOTICES',
    ]);
    expect(
      checkLicenses(
        workspace({
          ...files,
          'packages/core/THIRD_PARTY_NOTICES': `${MIT_NOTICE}\n  src/svg/url.ts\n\n${braintree}\n  src/svg/url.ts\n`,
        })
      )
    ).toEqual([]);
  });

  it('requires plugin-icons/src/{resolve,name}.ts to credit @iconify/utils', () => {
    const root = workspace({
      'packages/plugin-icons/package.json': JSON.stringify({ name: 'icons', files: ['dist'] }),
      'packages/plugin-icons/src/resolve.ts': '// Ported from somewhere.\nexport {};\n',
      'packages/plugin-icons/src/name.ts': '// Ours.\nexport {};\n',
    });
    expect(checkLicenses(root)).toEqual([
      'packages/plugin-icons/src/name.ts: header must credit @iconify/utils',
      'packages/plugin-icons/src/resolve.ts: header must credit @iconify/utils',
    ]);
  });

  it('requires core/svg/url.ts to credit both Pele and @braintree/sanitize-url', () => {
    const root = workspace({
      'packages/core/package.json': manifest(),
      'packages/core/THIRD_PARTY_NOTICES': `${MIT_NOTICE}\n  src/svg/url.ts\n`,
      'packages/core/src/svg/url.ts': `${GOOD_HEADER}export {};\n`,
    });
    expect(checkLicenses(root)).toEqual([
      'packages/core/src/svg/url.ts: header must credit @braintree/sanitize-url',
    ]);
  });

  it('checks an ISC upstream (d3) by its own license, in its own section', () => {
    const header =
      '/**\n * After d3-hierarchy: https://github.com/d3/d3-hierarchy, ISC License, Copyright 2010-2021 Mike Bostock.\n */\n';
    const isc = (copyright: string) =>
      `d3-hierarchy\n------------\n  src/layout/tiles.ts\n\nISC License\n\n${copyright}\n\nPermission to use, copy, modify, and/or distribute this software for any purpose\n`;
    const files = {
      'packages/tree/package.json': JSON.stringify({
        name: 'tree',
        files: ['dist', 'THIRD_PARTY_NOTICES'],
      }),
      'packages/tree/src/layout/tiles.ts': `${header}export {};\n`,
    };
    // Pele's text is not needed for d3 files.
    expect(
      checkLicenses(
        workspace({
          ...files,
          'packages/tree/THIRD_PARTY_NOTICES': isc('Copyright 2010-2021 Mike Bostock'),
        })
      )
    ).toEqual([]);
    expect(
      checkLicenses(
        workspace({
          ...files,
          'packages/tree/src/layout/tiles.ts':
            '// After https://github.com/d3/d3-hierarchy, MIT, Mike Bostock.\nexport {};\n',
          'packages/tree/THIRD_PARTY_NOTICES': `MIT License\n\n${isc('Copyright 2010 Mike Bostock')}`,
        })
      )
    ).toEqual([
      'packages/tree/src/layout/tiles.ts: d3-hierarchy-derived header must name the ISC license and "Mike Bostock"',
      'packages/tree/THIRD_PARTY_NOTICES: must contain the ISC License text with "Copyright 2010-2021 Mike Bostock"',
    ]);
  });

  it('requires the treemap d3 ports to credit d3, though the package is private', () => {
    const root = workspace({
      'packages/diagram-treemap/package.json': JSON.stringify({ name: 'treemap', private: true }),
      'packages/diagram-treemap/src/layout/tiles.ts': '// Ours.\nexport {};\n',
      'packages/diagram-treemap/src/format/d3-format.ts': '// Ours.\nexport {};\n',
    });
    expect(checkLicenses(root)).toEqual([
      'packages/diagram-treemap/src/format/d3-format.ts: header must credit d3-format',
      'packages/diagram-treemap/src/layout/tiles.ts: header must credit d3-hierarchy',
    ]);
  });

  it('passes on this repository', () => {
    expect(checkLicenses(join(import.meta.dirname, '..', '..', '..'))).toEqual([]);
  });
});
