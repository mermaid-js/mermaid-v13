/**
 * License check (R-REL-4, D12): code ported from Pele carries MIT attribution.
 *
 * A file is Pele-derived when its leading comment block links to Pele's repository. Then:
 * - that header names the MIT license and the copyright holder ("kepano");
 * - in a published package (`packages/*` without `"private": true`), the package root has a
 *   `THIRD_PARTY_NOTICES` that holds the MIT text, lists the file by its package-relative path
 *   and is in the package's `"files"`, so it ships in the tarball;
 * - every path the notices list still exists.
 * Spec files are not published and are skipped. Tools are not published either, so only their
 * headers are checked.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const PELE_URL = 'https://github.com/obsidianmd/pele';
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

/** Package-relative paths of the Pele-derived files under `dir`; header problems go to `problems`. */
function derivedFiles(root: string, dir: string, problems: string[]): string[] {
  const derived: string[] = [];
  for (const file of sourceFiles(dir)) {
    const header = leadingComment(readFileSync(file, 'utf8'));
    if (!header.includes(PELE_URL)) continue;
    if (!/\bMIT\b/.test(header) || !header.includes('kepano'))
      problems.push(
        `${relative(root, file)}: Pele-derived header must name the MIT license and "kepano"`
      );
    derived.push(relative(dir, file));
  }
  return derived;
}

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
    if (manifest.private) continue;

    const pkg = relative(root, pkgDir);
    const derived = derivedFiles(root, pkgDir, problems);
    const noticesPath = join(pkgDir, NOTICES);
    if (!existsSync(noticesPath)) {
      if (derived.length > 0) problems.push(`${pkg}: has Pele-derived files but no ${NOTICES}`);
      continue;
    }

    const notices = readFileSync(noticesPath, 'utf8');
    if (!notices.includes('MIT License') || !notices.includes('Copyright (c) 2026 kepano'))
      problems.push(
        `${pkg}/${NOTICES}: must contain the MIT License text with "Copyright (c) 2026 kepano"`
      );
    if (!(manifest.files ?? []).includes(NOTICES))
      problems.push(`${pkg}/package.json: "files" must include ${NOTICES}`);

    const listed = new Set(notices.match(/(?<=^\s*)src\/\S+\.(?:ts|js|mjs)$/gm) ?? []);
    for (const file of derived)
      if (!listed.has(file)) problems.push(`${pkg}/${file}: not listed in ${pkg}/${NOTICES}`);
    for (const file of listed)
      if (!existsSync(join(pkgDir, file)))
        problems.push(`${pkg}/${NOTICES}: lists ${file}, which does not exist`);
  }

  for (const toolDir of childDirs(join(root, 'tools'))) derivedFiles(root, toolDir, problems);

  return problems;
}
