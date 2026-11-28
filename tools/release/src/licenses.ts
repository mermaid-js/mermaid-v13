/**
 * License check (R-REL-4, D12): ported code carries its upstreams' attribution, under each
 * upstream's license (MIT unless the upstream says otherwise: BSD 3-Clause or ISC).
 *
 * `UPSTREAMS` maps each upstream to the marker that credits it in a file's leading comment
 * block (its repository URL, or a package name). The shared upstreams are listed here; each
 * diagram package lists its own in its `workspace.yaml` (`credits:`). A file is derived from an
 * upstream when its header has that marker. Then:
 * - that header names the upstream's license and every copyright holder of the upstream;
 * - in a published package (`packages/*` without `"private": true`), and in a private one that
 *   holds a file of `REQUIRED_CREDITS` (so making a package private does not drop its credits),
 *   the package root has a `THIRD_PARTY_NOTICES` that holds the upstream's license text and
 *   every copyright line of it (an upstream that is not MIT in its own section), lists the file by its
 *   package-relative path (in that upstream's section, when the notices have one per upstream)
 *   and is in the package's `"files"`, so it ships in the tarball;
 * - every path the notices list still exists (notices may also credit a runtime dependency, such
 *   as layout-elk's elkjs, or code the package bundles from a dev dependency, such as
 *   plugin-math's MathJax, with no file listed);
 * - the files in `REQUIRED_CREDITS` credit the upstreams listed for them;
 * - the notices of a package in `BUNDLED_CREDITS` hold the license text and copyright lines of
 *   each upstream listed for it, as for a file of its own.
 * Spec files are not published and are skipped. Tools are not published either, so only their
 * headers are checked.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { workspaceDiagrams } from '../../workspace/diagrams.ts';

interface Upstream {
  /** The section heading in THIRD_PARTY_NOTICES. */
  readonly name: string;
  /** Text in a file header that marks the file as derived from this upstream. */
  readonly marker: string;
  /** The copyright holders a header names, every one. */
  readonly holder: readonly string[];
  /** The copyright lines the notices hold, every one. */
  readonly copyright: readonly string[];
  /** The upstream's license; MIT when absent. */
  readonly license?: License;
}

type License = 'MIT' | 'BSD-3-Clause' | 'ISC';

/** How a file header names each license. */
const LICENSE_HEADER: Readonly<Record<License, RegExp>> = {
  MIT: /\bMIT\b/,
  'BSD-3-Clause': /\bBSD 3-Clause\b/,
  ISC: /\bISC\b/,
};

/** Text a notices file must hold for each license: its name and, for BSD and ISC, its grant. */
const LICENSE_TEXT: Readonly<Record<License, readonly string[]>> = {
  MIT: ['MIT License'],
  'BSD-3-Clause': [
    'BSD 3-Clause License',
    'Redistribution and use in source and binary forms, with or without modification,',
  ],
  ISC: [
    'ISC License',
    'Permission to use, copy, modify, and/or distribute this software for any purpose',
  ],
};

const licenseOf = (u: Upstream): License => u.license ?? 'MIT';

/** `"a"`, or `"a" and "b"`: how a message names holders or copyright lines. */
const quoted = (items: readonly string[]): string => items.map((i) => `"${i}"`).join(' and ');

/**
 * Upstreams of code outside the diagram packages. A diagram package declares the upstreams of
 * its own ported files in its `workspace.yaml` (`credits.upstreams`, `tools/workspace`), so a
 * port never edits this file.
 */
const SHARED_UPSTREAMS: readonly Upstream[] = [
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
];

// A pre-manifest package's ported files need their credits as soon as they exist.
const DIAGRAMS = workspaceDiagrams();

/** A `credits.upstreams` row of `pkg`'s workspace.yaml, checked to be an {@link Upstream}. */
function upstreamOf(pkg: string, row: Readonly<Record<string, unknown>>): Upstream {
  const strings = (v: unknown) => Array.isArray(v) && v.every((s) => typeof s === 'string');
  const { name, marker, holder, copyright, license } = row;
  if (
    typeof name !== 'string' ||
    typeof marker !== 'string' ||
    !strings(holder) ||
    !strings(copyright) ||
    (license !== undefined && !(typeof license === 'string' && license in LICENSE_HEADER))
  )
    throw new Error(
      `${pkg}/workspace.yaml: credits.upstreams rows need name, marker, holder: [..], ` +
        `copyright: [..] and an optional license (${Object.keys(LICENSE_HEADER).join(', ')})`
    );
  return row as unknown as Upstream;
}

/** Each diagram package's upstreams, by name, in package order (one definition per name). */
const DIAGRAM_UPSTREAMS: ReadonlyMap<string, Upstream> = (() => {
  const byName = new Map<string, Upstream>();
  for (const d of DIAGRAMS)
    for (const row of d.wiring.credits?.upstreams ?? []) {
      const u = upstreamOf(d.dir, row);
      const seen = byName.get(u.name);
      if (seen && JSON.stringify(seen) !== JSON.stringify(u))
        throw new Error(`${d.dir}/workspace.yaml: upstream "${u.name}" differs from another's`);
      byName.set(u.name, u);
    }
  return byName;
})();

export const UPSTREAMS: readonly Upstream[] = [...SHARED_UPSTREAMS, ...DIAGRAM_UPSTREAMS.values()];

/**
 * Workspace-relative files that must credit these upstreams (checked when the file exists): the
 * shared ones here, and each diagram package's `credits.files`.
 */
export const REQUIRED_CREDITS: Readonly<Record<string, readonly string[]>> = {
  'packages/core/src/svg/url.ts': ['@braintree/sanitize-url'],
  'packages/plugin-icons/src/resolve.ts': ['@iconify/utils'],
  'packages/plugin-icons/src/name.ts': ['@iconify/utils'],
  ...Object.fromEntries(
    DIAGRAMS.flatMap((d) =>
      Object.entries(d.wiring.credits?.files ?? {}).map(([file, names]) => {
        for (const n of names)
          if (!UPSTREAMS.some((u) => u.name === n))
            throw new Error(`${d.dir}/workspace.yaml: credits.files names no upstream "${n}"`);
        return [`${d.dir}/${file}`, names] as const;
      })
    )
  ),
};

/**
 * Workspace packages whose build bundles another package's ported code with the legal comments
 * stripped, so their own notices carry those upstreams: mermaid's CDN build
 * (`legalComments: 'none'`) bundles every diagram package, so mermaid carries every diagram
 * package's upstreams. Pending for the maintainer: core's `@braintree/sanitize-url`.
 */
export const BUNDLED_CREDITS: Readonly<Record<string, readonly string[]>> = {
  // A pre-manifest package is not in mermaid's registry yet, so mermaid does not bundle it.
  'packages/mermaid': [
    ...new Set(
      DIAGRAMS.filter((d) => d.manifest !== undefined).flatMap((d) =>
        (d.wiring.credits?.upstreams ?? []).map((u) => upstreamOf(d.dir, u).name)
      )
    ),
  ],
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
      const holders = upstream.holder;
      if (!LICENSE_HEADER[license].test(header) || !holders.every((h) => header.includes(h)))
        problems.push(
          `${rel}: ${upstream.name}-derived header must name the ${license} license and ${quoted(holders)}`
        );
      derived.push({ file: relative(dir, file), upstream });
    }
  }
  return derived;
}

/** The part of the notices under `name`'s heading line; empty without that heading. */
function section(notices: string, name: string): string {
  const lines = notices.split('\n');
  const headings = UPSTREAMS.map((u) => u.name);
  const start = lines.findIndex((l) => l.trim() === name);
  if (start < 0) return '';
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
    };
    const pkg = relative(root, pkgDir);
    const noticesPath = join(pkgDir, NOTICES);
    // A private package is checked when it holds a file that must credit an upstream.
    const required = Object.keys(REQUIRED_CREDITS).some((f) => f.startsWith(`${pkg}/`));
    if (manifest.private && !required) continue;

    const derived = derivedFiles(root, pkgDir, problems);
    const bundled = UPSTREAMS.filter((u) => BUNDLED_CREDITS[pkg]?.includes(u.name));
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
    // The notices hold the text of each upstream the package's files come from or it bundles;
    // notices that only credit a runtime dependency (layout-elk's elkjs) or bundled code
    // (plugin-math's MathJax) need none.
    const used = UPSTREAMS.filter(
      (u) => derived.some((d) => d.upstream === u) || bundled.includes(u)
    );
    for (const u of used) {
      const license = licenseOf(u);
      // MIT text may stand anywhere in the notices (older ones have no sections); any other
      // license's must stand in its upstream's own section.
      const text = license === 'MIT' ? notices : section(notices, u.name);
      const lines = u.copyright;
      if (
        !LICENSE_TEXT[license].every((t) => text.includes(t)) ||
        !lines.every((c) => text.includes(c))
      )
        problems.push(
          `${pkg}/${NOTICES}: must contain the ${license} License text with ${quoted(lines)}`
        );
    }
    if (!(manifest.files ?? []).includes(NOTICES))
      problems.push(`${pkg}/package.json: "files" must include ${NOTICES}`);

    const listed = listedIn(notices);
    for (const { file, upstream } of derived) {
      if (!listed.has(file)) {
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
