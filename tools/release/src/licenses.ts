// cspell:ignore fmin
/**
 * License check (R-REL-4, D12): ported code carries its upstreams' attribution (MIT, or
 * BSD-3-Clause for fmin, which venn.js bundles).
 *
 * `UPSTREAMS` maps each upstream to the marker that credits it in a file's leading comment
 * block (the repository URLs of Pele, Iconify, venn.js and fmin; Braintree's sanitize-url
 * package name). A file is derived from an upstream when its header has that marker. Then:
 * - that header names the upstream's license (MIT unless the entry says otherwise) and every
 *   copyright holder of the upstream;
 * - in a published package (`packages/*` without `"private": true`), the package root has a
 *   `THIRD_PARTY_NOTICES` that holds the upstream's license text and every copyright line of it,
 *   lists the file by its package-relative path (in that upstream's section, when the notices
 *   have one per upstream) and is in the package's `"files"`, so it ships in the tarball;
 * - every path the notices list still exists (notices may also credit a runtime dependency, such
 *   as layout-elk's elkjs, or code the package bundles from a dev dependency, such as
 *   plugin-math's MathJax, with no file listed);
 * - the files in `REQUIRED_CREDITS` credit the upstreams listed for them.
 * Spec files are not published and are skipped. Tools are not published either, so only their
 * headers are checked.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/** The licenses ported code may come under. */
type License = 'MIT' | 'BSD-3-Clause';

/** How a header names each license, and a line of its text the notices must hold. */
const LICENSES: Readonly<Record<License, { readonly header: RegExp; readonly text: string }>> = {
  MIT: { header: /\bMIT\b/, text: 'MIT License' },
  'BSD-3-Clause': {
    header: /\bBSD-3-Clause\b/,
    text: 'Redistribution and use in source and binary forms',
  },
};

interface Upstream {
  /** The section heading in THIRD_PARTY_NOTICES. */
  readonly name: string;
  /** Text in a file header that marks the file as derived from this upstream. */
  readonly marker: string;
  /** MIT when not given. */
  readonly license?: License;
  /** The copyright holders a header names, every one. */
  readonly holder: readonly string[];
  /** The copyright lines the notices hold, every one. */
  readonly copyright: readonly string[];
}

export const UPSTREAMS: readonly Upstream[] = [
  {
    name: 'Pele',
    marker: 'https://github.com/obsidianmd/pele',
    holder: ['kepano'],
    copyright: ['Copyright (c) 2026 kepano'],
  },
  {
    name: '@braintree/sanitize-url',
    marker: '@braintree/sanitize-url',
    holder: ['Braintree'],
    copyright: ['Copyright (c) 2017 Braintree'],
  },
  {
    // cspell:ignore Vjacheslav Trushkin
    name: '@iconify/utils',
    marker: 'https://github.com/iconify/iconify',
    holder: ['Vjacheslav Trushkin'],
    copyright: ['Copyright (c) 2021-PRESENT Vjacheslav Trushkin'],
  },
  {
    // cspell:ignore Frederickson Gratzl
    name: 'venn.js',
    marker: 'https://github.com/upsetjs/venn.js',
    holder: ['Ben Frederickson', 'Samuel Gratzl'],
    copyright: ['Copyright (c) 2013 Ben Frederickson', 'Copyright (c) 2021 Samuel Gratzl'],
  },
  {
    // venn.js bundles fmin's optimisers, under fmin's own license.
    name: 'fmin',
    marker: 'https://github.com/benfred/fmin',
    license: 'BSD-3-Clause',
    holder: ['Ben Frederickson'],
    copyright: ['Copyright 2016, Ben Frederickson'],
  },
];

/** Workspace-relative files that must credit these upstreams (checked when the file exists). */
export const REQUIRED_CREDITS: Readonly<Record<string, readonly string[]>> = {
  'packages/core/src/svg/url.ts': ['Pele', '@braintree/sanitize-url'],
  'packages/plugin-icons/src/resolve.ts': ['@iconify/utils'],
  'packages/plugin-icons/src/name.ts': ['@iconify/utils'],
  'packages/diagram-venn/src/solver/circles.ts': ['venn.js'],
  'packages/diagram-venn/src/solver/fmin.ts': ['fmin', 'venn.js'],
  'packages/diagram-venn/src/solver/index.ts': ['venn.js'],
  'packages/diagram-venn/src/solver/normalize.ts': ['venn.js'],
  'packages/diagram-venn/src/solver/regions.ts': ['venn.js'],
  'packages/diagram-venn/src/solver/solve.ts': ['venn.js'],
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
      const license = upstream.license ?? 'MIT';
      const holders = upstream.holder;
      if (!LICENSES[license].header.test(header) || !holders.every((h) => header.includes(h)))
        problems.push(
          `${rel}: ${upstream.name}-derived header must name the ${license} license and ${holders.map((h) => `"${h}"`).join(' and ')}`
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
    const noticesPath = join(pkgDir, NOTICES);
    if (!existsSync(noticesPath)) {
      if (derived.length > 0) {
        const from = [...new Set(derived.map((d) => d.upstream.name))].join(', ');
        problems.push(`${pkg}: has files ported from ${from} but no ${NOTICES}`);
      }
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
        derived.some((d) => d.upstream === u)
    );
    for (const u of used) {
      const license = u.license ?? 'MIT';
      const lines = u.copyright;
      if (!notices.includes(LICENSES[license].text) || !lines.every((c) => notices.includes(c)))
        problems.push(
          `${pkg}/${NOTICES}: must contain the ${license} License text with ${lines.map((c) => `"${c}"`).join(' and ')}`
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
