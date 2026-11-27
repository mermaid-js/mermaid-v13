import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkLicenses } from './licenses.ts';

const ICONIFY_HEADER =
  '// Ported from Iconify (https://github.com/iconify/iconify, MIT License, Copyright (c) 2021-PRESENT Vjacheslav Trushkin).\n';

/** `@iconify/utils`' section of a notices file, listing `files`. */
const iconifyNotice = (...files: string[]) =>
  `@iconify/utils\n--------------\n${files.map((f) => `  ${f}\n`).join('')}\nMIT License\n\nCopyright (c) 2021-PRESENT Vjacheslav Trushkin\n`;

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
      'packages/core/THIRD_PARTY_NOTICES': iconifyNotice('src/layout/a.ts'),
      'packages/core/src/layout/a.ts': `${ICONIFY_HEADER}export const a = 1;\n`,
      'packages/core/src/other.ts': '// Our own code.\nexport const b = 2;\n',
    });
    expect(checkLicenses(root)).toEqual([]);
  });

  it('reports a ported file whose header lacks the MIT attribution', () => {
    const root = workspace({
      'packages/core/package.json': manifest(),
      'packages/core/THIRD_PARTY_NOTICES': iconifyNotice('src/a.ts'),
      'packages/core/src/a.ts':
        '// Ported from Iconify (https://github.com/iconify/iconify), src/a.ts.\nexport {};\n',
    });
    expect(checkLicenses(root)).toEqual([
      'packages/core/src/a.ts: @iconify/utils-derived header must name the MIT license and "Vjacheslav Trushkin"',
    ]);
  });

  it('reports a ported file that the package notices do not list', () => {
    const root = workspace({
      'packages/core/package.json': manifest(),
      'packages/core/THIRD_PARTY_NOTICES': iconifyNotice(),
      'packages/core/src/a.ts': `/**\n * Doc.\n${ICONIFY_HEADER.replace('//', ' *')} */\nexport {};\n`,
    });
    expect(checkLicenses(root)).toEqual([
      'packages/core/src/a.ts: not listed under @iconify/utils in packages/core/THIRD_PARTY_NOTICES',
    ]);
  });

  it('requires a THIRD_PARTY_NOTICES with the MIT text that the package publishes', () => {
    const missing = workspace({
      'packages/icons/package.json': JSON.stringify({ name: 'icons', files: ['dist'] }),
      'packages/icons/src/a.ts': `${ICONIFY_HEADER}export {};\n`,
    });
    expect(checkLicenses(missing)).toEqual([
      'packages/icons: has files ported from @iconify/utils but no THIRD_PARTY_NOTICES',
    ]);

    const unpublished = workspace({
      'packages/icons/package.json': JSON.stringify({ name: 'icons', files: ['dist'] }),
      'packages/icons/THIRD_PARTY_NOTICES': '@iconify/utils\n  src/a.ts\n',
      'packages/icons/src/a.ts': `${ICONIFY_HEADER}export {};\n`,
    });
    expect(checkLicenses(unpublished)).toEqual([
      'packages/icons/THIRD_PARTY_NOTICES: must contain the MIT License text with "Copyright (c) 2021-PRESENT Vjacheslav Trushkin"',
      'packages/icons/package.json: "files" must include THIRD_PARTY_NOTICES',
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

  it("checks each upstream's text and listing in its own section", () => {
    const files = {
      'packages/icons/package.json': JSON.stringify({
        name: 'icons',
        files: ['dist', 'THIRD_PARTY_NOTICES'],
      }),
      'packages/icons/src/a.ts': `${ICONIFY_HEADER}export {};\n`,
    };
    expect(
      checkLicenses(
        workspace({ ...files, 'packages/icons/THIRD_PARTY_NOTICES': iconifyNotice('src/a.ts') })
      )
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
      'packages/core/THIRD_PARTY_NOTICES': iconifyNotice('src/a.ts', 'src/gone.ts'),
      'packages/core/src/a.ts': `${ICONIFY_HEADER}export {};\n`,
    });
    expect(checkLicenses(root)).toEqual([
      'packages/core/THIRD_PARTY_NOTICES: lists src/gone.ts, which does not exist',
    ]);
  });

  it('ignores upstream links outside the file header, spec files and private packages', () => {
    const root = workspace({
      'packages/core/package.json': manifest(),
      'packages/core/src/a.ts':
        'export const a = 1;\n// see https://github.com/iconify/iconify for the idea\n',
      'packages/core/src/a.spec.ts': '// https://github.com/iconify/iconify\n',
      'packages/bench/package.json': JSON.stringify({ name: 'bench', private: true }),
      'packages/bench/src/b.ts': '// https://github.com/iconify/iconify\n',
    });
    expect(checkLicenses(root)).toEqual([]);
  });

  it('checks headers (not notices) of ported tools', () => {
    const root = workspace({
      'tools/gen/src/a.ts': '// Ported from https://github.com/iconify/iconify.\n',
    });
    expect(checkLicenses(root)).toEqual([
      'tools/gen/src/a.ts: @iconify/utils-derived header must name the MIT license and "Vjacheslav Trushkin"',
    ]);
  });

  it('requires the upstream notice and listing for a file ported from @braintree/sanitize-url', () => {
    const header = '// Port of @braintree/sanitize-url (MIT, (c) 2017 Braintree).\n';
    const braintree = `@braintree/sanitize-url\n-----------------------\n  src/svg/url.ts\n\nMIT License\n\nCopyright (c) 2017 Braintree\n`;
    const files = {
      'packages/core/package.json': manifest(),
      'packages/core/src/svg/url.ts': `${header}export {};\n`,
    };
    expect(
      checkLicenses(
        workspace({ ...files, 'packages/core/THIRD_PARTY_NOTICES': '  src/svg/url.ts\n' })
      )
    ).toEqual([
      'packages/core/THIRD_PARTY_NOTICES: must contain the MIT License text with "Copyright (c) 2017 Braintree"',
      'packages/core/src/svg/url.ts: not listed under @braintree/sanitize-url in packages/core/THIRD_PARTY_NOTICES',
    ]);
    expect(
      checkLicenses(workspace({ ...files, 'packages/core/THIRD_PARTY_NOTICES': braintree }))
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

  it('requires core/svg/url.ts to credit @braintree/sanitize-url', () => {
    const root = workspace({
      'packages/core/package.json': manifest(),
      'packages/core/src/svg/url.ts': '// Our own code.\nexport {};\n',
    });
    expect(checkLicenses(root)).toEqual([
      'packages/core/src/svg/url.ts: header must credit @braintree/sanitize-url',
    ]);
  });

  // cspell:ignore Frederickson Gratzl
  const VENN_HEADER =
    '// Ported from venn.js (https://github.com/upsetjs/venn.js), MIT License, Copyright (c) 2013 Ben Frederickson, Copyright (c) 2021 Samuel Gratzl.\n';
  const FMIN_HEADER =
    '// Ported from fmin (https://github.com/benfred/fmin), BSD 3-Clause License, Copyright 2016, Ben Frederickson.\n';
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
      'packages/venn/src/b.ts': `${FMIN_HEADER.replace('BSD 3-Clause', 'MIT')}${VENN_HEADER}export {};\n`,
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

  it('checks a BSD 3-Clause upstream (d3-sankey) by its own license, in its own section', () => {
    const header =
      '/**\n * After https://github.com/d3/d3-sankey, BSD 3-Clause License, Copyright 2015 Mike Bostock.\n */\n';
    const bsd = (copyright: string) =>
      `d3-sankey\n---------\n  src/layout/d3-sankey.ts\n\nBSD 3-Clause License\n\n${copyright}\n\nRedistribution and use in source and binary forms, with or without modification,\n`;
    const files = {
      'packages/flow/package.json': JSON.stringify({
        name: 'flow',
        files: ['dist', 'THIRD_PARTY_NOTICES'],
      }),
      'packages/flow/src/layout/d3-sankey.ts': `${header}export {};\n`,
    };
    expect(
      checkLicenses(
        workspace({
          ...files,
          'packages/flow/THIRD_PARTY_NOTICES': bsd('Copyright 2015, Mike Bostock'),
        })
      )
    ).toEqual([]);
    expect(
      checkLicenses(
        workspace({
          ...files,
          'packages/flow/src/layout/d3-sankey.ts':
            '// After https://github.com/d3/d3-sankey, MIT, Mike Bostock.\nexport {};\n',
          'packages/flow/THIRD_PARTY_NOTICES': `MIT License\n\n${bsd('Copyright 2015 Mike Bostock')}`,
        })
      )
    ).toEqual([
      'packages/flow/src/layout/d3-sankey.ts: d3-sankey-derived header must name the BSD-3-Clause license and "Mike Bostock"',
      'packages/flow/THIRD_PARTY_NOTICES: must contain the BSD-3-Clause License text with "Copyright 2015, Mike Bostock"',
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

  it('requires the sankey d3 ports to credit d3-sankey, d3-array and d3-shape, though the package is private', () => {
    for (const pkg of [{ name: 'sankey', private: true }, { name: 'sankey' }]) {
      const root = workspace({
        'packages/diagram-sankey/package.json': JSON.stringify(pkg),
        'packages/diagram-sankey/src/layout/d3-sankey.ts': '// Ours.\nexport {};\n',
        'packages/diagram-sankey/src/layout/layout.ts': '// Ours.\nexport {};\n',
      });
      expect(checkLicenses(root)).toEqual([
        'packages/diagram-sankey/src/layout/d3-sankey.ts: header must credit d3-sankey',
        'packages/diagram-sankey/src/layout/d3-sankey.ts: header must credit d3-array',
        'packages/diagram-sankey/src/layout/layout.ts: header must credit d3-shape',
      ]);
    }
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

  it('requires the d3, venn.js and fmin notices in mermaid, whose CDN build bundles diagram-sankey, diagram-treemap and diagram-venn', () => {
    const bsd = (name: string, copyright: string) =>
      `${name}\n----\nBSD 3-Clause License\n\n${copyright}\n\nRedistribution and use in source and binary forms, with or without modification,\n`;
    const isc = (name: string, copyright: string) =>
      `${name}\n----\nISC License\n\n${copyright}\n\nPermission to use, copy, modify, and/or distribute this software for any purpose\n`;
    const files = {
      'packages/mermaid/package.json': JSON.stringify({
        name: 'mermaid',
        files: ['dist', 'THIRD_PARTY_NOTICES'],
      }),
    };
    const d3 = [
      bsd('d3-sankey', 'Copyright 2015, Mike Bostock'),
      bsd('d3-array', 'Copyright 2010-2020 Mike Bostock'),
      bsd('d3-shape', 'Copyright 2010-2015 Mike Bostock'),
      isc('d3-hierarchy', 'Copyright 2010-2021 Mike Bostock'),
      isc('d3-format', 'Copyright 2010-2026 Mike Bostock'),
      'venn.js\n----\nMIT License\n\nCopyright (c) 2013 Ben Frederickson\nCopyright (c) 2021 Samuel Gratzl\n',
      bsd('fmin', 'Copyright 2016, Ben Frederickson'),
    ];
    expect(
      checkLicenses(workspace({ ...files, 'packages/mermaid/THIRD_PARTY_NOTICES': d3.join('\n') }))
    ).toEqual([]);
    expect(
      checkLicenses(
        workspace({
          ...files,
          'packages/mermaid/THIRD_PARTY_NOTICES': [...d3.slice(0, 2), ...d3.slice(3)].join('\n'),
        })
      )
    ).toEqual([
      'packages/mermaid/THIRD_PARTY_NOTICES: must contain the BSD-3-Clause License text with "Copyright 2010-2015 Mike Bostock"',
    ]);
    expect(
      checkLicenses(
        workspace({
          ...files,
          'packages/mermaid/THIRD_PARTY_NOTICES': [...d3.slice(0, 4), ...d3.slice(5)].join('\n'),
        })
      )
    ).toEqual([
      'packages/mermaid/THIRD_PARTY_NOTICES: must contain the ISC License text with "Copyright 2010-2026 Mike Bostock"',
    ]);
    expect(
      checkLicenses(
        workspace({
          ...files,
          'packages/mermaid/THIRD_PARTY_NOTICES': d3.slice(0, 5).join('\n'),
        })
      )
    ).toEqual([
      'packages/mermaid/THIRD_PARTY_NOTICES: must contain the MIT License text with "Copyright (c) 2013 Ben Frederickson" and "Copyright (c) 2021 Samuel Gratzl"',
      'packages/mermaid/THIRD_PARTY_NOTICES: must contain the BSD-3-Clause License text with "Copyright 2016, Ben Frederickson"',
    ]);
    expect(checkLicenses(workspace(files))).toEqual([
      'packages/mermaid: bundles code ported from d3-sankey, d3-array, d3-shape, d3-hierarchy, d3-format, venn.js, fmin but has no THIRD_PARTY_NOTICES',
    ]);
  });

  it('passes on this repository', () => {
    expect(checkLicenses(join(import.meta.dirname, '..', '..', '..'))).toEqual([]);
  });
});
