import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

  // cspell:ignore Frederickson Gratzl
  const VENN_HEADER =
    '// Ported from venn.js (https://github.com/upsetjs/venn.js), MIT License, Copyright (c) 2013 Ben Frederickson, Copyright (c) 2021 Samuel Gratzl.\n';
  const FMIN_HEADER =
    '// Ported from fmin (https://github.com/benfred/fmin), BSD-3-Clause License, Copyright 2016, Ben Frederickson.\n';
  const VENN_NOTICE =
    'venn.js\n-------\n\n  src/a.ts\n  src/b.ts\n\nMIT License\n\nCopyright (c) 2013 Ben Frederickson\nCopyright (c) 2021 Samuel Gratzl\n';
  const FMIN_NOTICE =
    'fmin\n----\n\n  src/b.ts\n\nBSD 3-Clause License\n\nCopyright 2016, Ben Frederickson\n\nRedistribution and use in source and binary forms, with or without modification,\n';
  const vennManifest = JSON.stringify({ name: 'venn', files: ['dist', 'THIRD_PARTY_NOTICES'] });

  it('credits every holder of an upstream with several, and a BSD-3-Clause upstream', () => {
    const good = workspace({
      'packages/venn/package.json': vennManifest,
      'packages/venn/THIRD_PARTY_NOTICES': `${VENN_NOTICE}\n${FMIN_NOTICE}`,
      'packages/venn/src/a.ts': `${VENN_HEADER}export {};\n`,
      'packages/venn/src/b.ts': `${FMIN_HEADER}${VENN_HEADER}export {};\n`,
    });
    expect(checkLicenses(good)).toEqual([]);
    const bad = workspace({
      'packages/venn/package.json': vennManifest,
      'packages/venn/THIRD_PARTY_NOTICES':
        VENN_NOTICE.replace('Copyright (c) 2021 Samuel Gratzl\n', '') +
        FMIN_NOTICE.replace(/Redistribution.*\n/, ''),
      'packages/venn/src/a.ts': `${VENN_HEADER.replace(', Copyright (c) 2021 Samuel Gratzl', '')}export {};\n`,
      'packages/venn/src/b.ts': `${FMIN_HEADER.replace('BSD-3-Clause', 'MIT')}${VENN_HEADER}export {};\n`,
    });
    expect(checkLicenses(bad)).toEqual([
      'packages/venn/src/a.ts: venn.js-derived header must name the MIT license and "Ben Frederickson" and "Samuel Gratzl"',
      'packages/venn/src/b.ts: fmin-derived header must name the BSD-3-Clause license and "Ben Frederickson"',
      'packages/venn/THIRD_PARTY_NOTICES: must contain the MIT License text with "Copyright (c) 2013 Ben Frederickson" and "Copyright (c) 2021 Samuel Gratzl"',
      'packages/venn/THIRD_PARTY_NOTICES: must contain the BSD-3-Clause License text with "Copyright 2016, Ben Frederickson"',
    ]);
  });

  it('checks the published venn package, whose solver credits venn.js and fmin', () => {
    // diagram-venn is public since its integration ticket (#501), so the check covers it in
    // this repository; on a copy, a ported file without its credit is caught.
    const repo = join(import.meta.dirname, '..', '..', '..');
    const root = mkdtempSync(join(tmpdir(), 'licenses-venn-'));
    const pkg = join(repo, 'packages', 'diagram-venn');
    for (const entry of ['src', 'THIRD_PARTY_NOTICES', 'package.json'])
      cpSync(join(pkg, entry), join(root, 'packages', 'diagram-venn', entry), { recursive: true });
    const published = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')) as {
      private?: boolean;
    };
    expect(published.private).toBeUndefined();
    expect(checkLicenses(root)).toEqual([]);
    // It checks the solver: a ported file without its credit is caught.
    writeFileSync(
      join(root, 'packages', 'diagram-venn', 'src', 'solver', 'solve.ts'),
      'export {};\n'
    );
    expect(checkLicenses(root)).toEqual([
      'packages/diagram-venn/src/solver/solve.ts: header must credit venn.js',
    ]);
  });

  it('passes on this repository', () => {
    expect(checkLicenses(join(import.meta.dirname, '..', '..', '..'))).toEqual([]);
  });
});
