/**
 * `packages/mermaid/src/version.ts` is the version the error image, `data-mermaid-version` and
 * `mermaid --version` report. `changeset version` bumps only package.json, so the release
 * workflow runs `pnpm release:sync-version` right after it (parity.spec checks they agree).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const COMMENT =
  '/** The package version, written as `data-mermaid-version`. Keep in step with package.json. */';

export const versionSource = (version: string): string =>
  `${COMMENT}\nexport const VERSION = '${version}';\n`;

/** Writes version.ts from packages/mermaid/package.json; returns the version and whether it changed. */
export function syncVersionFile(root: string): { version: string; changed: boolean } {
  const pkg = join(root, 'packages', 'mermaid');
  const { version } = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')) as {
    version: string;
  };
  const file = join(pkg, 'src', 'version.ts');
  const want = versionSource(version);
  if (readFileSync(file, 'utf8') === want) return { version, changed: false };
  writeFileSync(file, want);
  return { version, changed: true };
}
