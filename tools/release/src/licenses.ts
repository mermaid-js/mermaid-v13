/**
 * License check (R-REL-4, D12): ported code carries its upstreams' attribution, under each
 * upstream's license (MIT unless the upstream says otherwise; d3-sankey, d3-array and d3-shape,
 * which sankey re-implements, are BSD 3-Clause).
 *
 * `UPSTREAMS` maps each upstream to the marker that credits it in a file's leading comment
 * block (Pele's, Iconify's and d3-sankey's, d3-array's and d3-shape's repository URLs;
 * Braintree's sanitize-url package name). A file is derived from an upstream when its header
 * has that marker. Then:
 * - that header names the upstream's license and copyright holder;
 * - in a published package (`packages/*` without `"private": true`), the package root has a
 *   `THIRD_PARTY_NOTICES` that holds the upstream's license text and copyright line (a license
 *   other than MIT in the upstream's own section), lists the file by its
 *   package-relative path (in that upstream's section, when the notices have one per upstream)
 *   and is in the package's `"files"`, so it ships in the tarball;
 * - every path the notices list still exists (notices may also credit a runtime dependency, such
 *   as layout-elk's elkjs, or code the package bundles from a dev dependency, such as
 *   plugin-math's MathJax, with no file listed);
 * - the files in `REQUIRED_CREDITS` credit the upstreams listed for them;
 * - the notices of a package in `BUNDLED_CREDITS` hold the license text and copyright line of
 *   each upstream listed for it, as for a file of its own.
 * Spec files are not published and are skipped. Tools are not published either, so only their
 * headers are checked.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

interface Upstream {
  /** The section heading in THIRD_PARTY_NOTICES. */
  readonly name: string;
  /** Text in a file header that marks the file as derived from this upstream. */
  readonly marker: string;
  readonly holder: string;
  readonly copyright: string;
  /** The upstream's license; MIT when absent. */
  readonly license?: License;
}

type License = 'MIT' | 'BSD-3-Clause';

/** How a file header names each license. */
const LICENSE_HEADER: Readonly<Record<License, RegExp>> = {
  MIT: /\bMIT\b/,
  'BSD-3-Clause': /\bBSD 3-Clause\b/,
};

/** Text a notices file must hold for each license: its name and, for BSD, its grant. */
const LICENSE_TEXT: Readonly<Record<License, readonly string[]>> = {
  MIT: ['MIT License'],
  'BSD-3-Clause': [
    'BSD 3-Clause License',
    'Redistribution and use in source and binary forms, with or without modification,',
  ],
};

const licenseOf = (u: Upstream): License => u.license ?? 'MIT';

export const UPSTREAMS: readonly Upstream[] = [
  {
    name: 'Pele',
    marker: 'https://github.com/obsidianmd/pele',
    holder: 'kepano',
    copyright: 'Copyright (c) 2026 kepano',
  },
  {
    name: '@braintree/sanitize-url',
    marker: '@braintree/sanitize-url',
    holder: 'Braintree',
    copyright: 'Copyright (c) 2017 Braintree',
  },
  {
    // cspell:ignore Vjacheslav Trushkin
    name: '@iconify/utils',
    marker: 'https://github.com/iconify/iconify',
    holder: 'Vjacheslav Trushkin',
    copyright: 'Copyright (c) 2021-PRESENT Vjacheslav Trushkin',
  },
  {
    name: 'd3-sankey',
    marker: 'https://github.com/d3/d3-sankey',
    holder: 'Mike Bostock',
    copyright: 'Copyright 2015, Mike Bostock',
    license: 'BSD-3-Clause',
  },
  {
    name: 'd3-array',
    marker: 'https://github.com/d3/d3-array',
    holder: 'Mike Bostock',
    copyright: 'Copyright 2010-2020 Mike Bostock',
    license: 'BSD-3-Clause',
  },
  {
    name: 'd3-shape',
    marker: 'https://github.com/d3/d3-shape',
    holder: 'Mike Bostock',
    copyright: 'Copyright 2010-2015 Mike Bostock',
    license: 'BSD-3-Clause',
  },
];

/** Workspace-relative files that must credit these upstreams (checked when the file exists). */
export const REQUIRED_CREDITS: Readonly<Record<string, readonly string[]>> = {
  'packages/core/src/svg/url.ts': ['Pele', '@braintree/sanitize-url'],
  'packages/plugin-icons/src/resolve.ts': ['@iconify/utils'],
  'packages/plugin-icons/src/name.ts': ['@iconify/utils'],
  'packages/diagram-sankey/src/layout/d3-sankey.ts': ['d3-sankey', 'd3-array'],
  'packages/diagram-sankey/src/layout/layout.ts': ['d3-shape'],
};

/**
 * Workspace packages whose build bundles another package's ported code with the legal comments
 * stripped (mermaid's CDN build, `legalComments: 'none'`, bundles diagram-sankey), so their own
 * notices carry those upstreams. Pending for the maintainer: core's `@braintree/sanitize-url`.
 */
export const BUNDLED_CREDITS: Readonly<Record<string, readonly string[]>> = {
  'packages/mermaid': ['d3-sankey', 'd3-array', 'd3-shape'],
};

const NOTICES = 'THIRD_PARTY_NOTICES';
const SKIP_DIRS = new Set(['node_modules', 'dist', 'fixtures', '__fixtures__']);

/** The comments (and blank lines) a file starts with, before its first statement. */
export function leadingComment(source: string): string {
  const out: string[] = [];
  let inBlock = false;
  for (const line of source.split('\n')) {
    const t = line.trim();
    if (inBlock) {
      out.push(line);
      if (t.includes('*/')) inBlock = false;
    } else if (t === '' || t.startsWith('//') || t.startsWith('#!')) {
      out.push(line);
    } else if (t.startsWith('/*')) {
      out.push(line);
      inBlock = !t.includes('*/', 2);
    } else break;
  }
  return out.join('\n');
}

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) files.push(...sourceFiles(path));
    } else if (/\.(?:ts|js|mjs)$/.test(entry.name) && !/\.spec\.\w+$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files.sort();
}

const childDirs = (dir: string) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name))
        .map((e) => join(dir, e.name))
        .sort()
    : [];

interface Derived {
  readonly file: string;
  readonly upstream: Upstream;
}

/** The derived files under `dir` (package-relative); header problems go to `problems`. */
function derivedFiles(root: string, dir: string, problems: string[]): Derived[] {
  const derived: Derived[] = [];
  for (const file of sourceFiles(dir)) {
    const header = leadingComment(readFileSync(file, 'utf8'));
    const rel = relative(root, file);
    for (const name of REQUIRED_CREDITS[rel] ?? []) {
      const upstream = UPSTREAMS.find((u) => u.name === name)!;
      if (!header.includes(upstream.marker))
        problems.push(`${rel}: header must credit ${upstream.name}`);
    }
    for (const upstream of UPSTREAMS) {
      if (!header.includes(upstream.marker)) continue;
      const license = licenseOf(upstream);
      if (!LICENSE_HEADER[license].test(header) || !header.includes(upstream.holder))
        problems.push(
          `${rel}: ${upstream.name}-derived header must name the ${license} license and "${upstream.holder}"`
        );
      derived.push({ file: relative(dir, file), upstream });
    }
  }
  return derived;
}

/**
 * The part of the notices under `name`'s heading line. Without that heading it is empty,
 * except for Pele, the first upstream, whose notices may predate per-upstream sections.
 */
function section(notices: string, name: string): string {
  const lines = notices.split('\n');
  const headings = UPSTREAMS.map((u) => u.name);
  const start = lines.findIndex((l) => l.trim() === name);
  if (start < 0) return name === 'Pele' ? notices : '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++)
    if (headings.includes(lines[i]!.trim())) {
      end = i;
      break;
    }
  return lines.slice(start, end).join('\n');
}

const listedIn = (text: string) => new Set(text.match(/(?<=^\s*)src\/\S+\.(?:ts|js|mjs)$/gm) ?? []);

/** Problems found under `root` (a workspace root); empty when R-REL-4 holds. */
export function checkLicenses(root: string): string[] {
  const problems: string[] = [];

  for (const pkgDir of childDirs(join(root, 'packages'))) {
    const manifestPath = join(pkgDir, 'package.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      private?: boolean;
      files?: string[];
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    if (manifest.private) continue;

    const pkg = relative(root, pkgDir);
    const derived = derivedFiles(root, pkgDir, problems);
    const bundled = UPSTREAMS.filter((u) => BUNDLED_CREDITS[pkg]?.includes(u.name));
    const noticesPath = join(pkgDir, NOTICES);
    if (!existsSync(noticesPath)) {
      if (derived.length > 0) {
        const from = [...new Set(derived.map((d) => d.upstream.name))].join(', ');
        problems.push(`${pkg}: has files ported from ${from} but no ${NOTICES}`);
      } else if (bundled.length > 0)
        problems.push(
          `${pkg}: bundles code ported from ${bundled.map((u) => u.name).join(', ')} but has no ${NOTICES}`
        );
      continue;
    }

    const notices = readFileSync(noticesPath, 'utf8');
    // Pele's text is required in every notices file, except one that only credits a runtime
    // dependency (layout-elk's elkjs) or bundled code (plugin-math's MathJax, a dev dependency)
    // in a package with no ported file, and one whose ported files all come from other upstreams
    // (plugin-icons' @iconify/utils).
    const headings = new Set(notices.split('\n').map((l) => l.trim()));
    const credited = { ...manifest.dependencies, ...manifest.devDependencies };
    const dependencyOnly =
      derived.length === 0 && Object.keys(credited).some((d) => headings.has(d));
    const othersOnly = derived.length > 0 && derived.every((d) => d.upstream.name !== 'Pele');
    const used = UPSTREAMS.filter(
      (u) =>
        (u.name === 'Pele' && !dependencyOnly && !othersOnly) ||
        derived.some((d) => d.upstream === u) ||
        bundled.includes(u)
    );
    for (const u of used) {
      const license = licenseOf(u);
      // MIT text may stand anywhere in the notices (older ones have no sections); any other
      // license's must stand in its upstream's own section.
      const text = license === 'MIT' ? notices : section(notices, u.name);
      if (!LICENSE_TEXT[license].every((t) => text.includes(t)) || !text.includes(u.copyright))
        problems.push(
          `${pkg}/${NOTICES}: must contain the ${license} License text with "${u.copyright}"`
        );
    }
    if (!(manifest.files ?? []).includes(NOTICES))
      problems.push(`${pkg}/package.json: "files" must include ${NOTICES}`);

    const listed = listedIn(notices);
    for (const { file, upstream } of derived) {
      if (!listed.has(file)) {
        if (upstream.name === 'Pele')
          problems.push(`${pkg}/${file}: not listed in ${pkg}/${NOTICES}`);
        else
          problems.push(`${pkg}/${file}: not listed under ${upstream.name} in ${pkg}/${NOTICES}`);
      } else if (!listedIn(section(notices, upstream.name)).has(file)) {
        problems.push(`${pkg}/${file}: not listed under ${upstream.name} in ${pkg}/${NOTICES}`);
      }
    }
    for (const file of listed)
      if (!existsSync(join(pkgDir, file)))
        problems.push(`${pkg}/${NOTICES}: lists ${file}, which does not exist`);
  }

  for (const toolDir of childDirs(join(root, 'tools'))) derivedFiles(root, toolDir, problems);

  return problems;
}
