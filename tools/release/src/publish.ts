/**
 * Pack and publish the workspace's published packages (R-REL-2, R-REL-3), following the
 * publish-fork procedure: `pnpm pack` (it rewrites `workspace:` ranges), rewrite the manifest
 * for the target registry, run the workspace-leak gate on the tarball, then `npm publish
 * <tarball>` with an explicit dist-tag. A directory is never published.
 */
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PackedManifest, Target } from './manifest.ts';
import {
  DIST_TAG,
  assertAlphaVersion,
  inexactWorkspaceRanges,
  publishManifest,
  workspaceLeaks,
} from './manifest.ts';

export interface Registry {
  target: Target;
  url: string;
}

export const REGISTRIES = {
  /** GitHub Packages, scope `@mermaid-chart` (D28). */
  private: { target: 'private', url: 'https://npm.pkg.github.com/' },
  public: { target: 'public', url: 'https://registry.npmjs.org/' },
} as const satisfies Record<Target, Registry>;

export interface PackedTarball {
  name: string;
  version: string;
  tarball: string;
}

interface WorkspacePackage {
  dir: string;
  manifest: PackedManifest & { private?: boolean };
}

/** Published (non-private) packages under `packages/`, each after the workspace packages it uses. */
export function publishedPackages(root: string): WorkspacePackage[] {
  const all = readdirSync(join(root, 'packages'))
    .map((name) => join(root, 'packages', name))
    .filter((dir) => existsSync(join(dir, 'package.json')))
    .map((dir) => ({
      dir,
      manifest: JSON.parse(
        readFileSync(join(dir, 'package.json'), 'utf8')
      ) as WorkspacePackage['manifest'],
    }))
    .filter((p) => !p.manifest.private)
    .sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
  const byName = new Map(all.map((p) => [p.manifest.name, p]));
  const ordered: WorkspacePackage[] = [];
  const visit = (p: WorkspacePackage) => {
    if (ordered.includes(p)) return;
    const { dependencies = {}, peerDependencies = {} } = p.manifest;
    for (const dep of Object.keys({ ...peerDependencies, ...dependencies })) {
      const d = byName.get(dep);
      if (d !== undefined) visit(d);
    }
    ordered.push(p);
  };
  all.forEach(visit);
  return ordered;
}

/**
 * `pnpm pack`s every published package into `outDir` with its manifest rewritten for `target`.
 * Throws, before anything is written, when a version is not `x.y.z-alpha.N` (unless
 * `requireAlpha` is false) and, per tarball, when a `workspace:` range survives.
 */
export function packAll(
  root: string,
  opts: { target: Target; outDir: string; requireAlpha?: boolean }
): PackedTarball[] {
  const packages = publishedPackages(root);
  if (opts.requireAlpha !== false) packages.forEach((p) => assertAlphaVersion(p.manifest));
  const workspace = packages.map((p) => p.manifest.name);
  const versions = new Map(packages.map((p) => [p.manifest.name, p.manifest.version]));
  mkdirSync(opts.outDir, { recursive: true });

  return packages.map(({ dir }) => {
    const work = mkdtempSync(join(tmpdir(), 'mermaid-pack-'));
    execFileSync('pnpm', ['pack', '--pack-destination', work], { cwd: dir, stdio: 'pipe' });
    const packedFile = readdirSync(work).find((f) => f.endsWith('.tgz'));
    if (packedFile === undefined) throw new Error(`pnpm pack wrote no tarball for ${dir}`);
    execFileSync('tar', ['-xzf', join(work, packedFile), '-C', work]);

    const manifestPath = join(work, 'package', 'package.json');
    const packed = JSON.parse(readFileSync(manifestPath, 'utf8')) as PackedManifest;
    const inexact = inexactWorkspaceRanges(packed, versions);
    if (inexact.length > 0)
      throw new Error(`INEXACT RANGE in ${packed.name}, do not publish:\n${inexact.join('\n')}`);
    // MIT asks for the notice in every copy; the packages have no LICENSE of their own.
    const license = join(work, 'package', 'LICENSE');
    if (!existsSync(license)) copyFileSync(join(root, 'LICENSE'), license);
    const manifest = publishManifest(packed, { target: opts.target, workspace });
    const leaks = workspaceLeaks(manifest);
    if (leaks.length > 0)
      throw new Error(`WORKSPACE LEAK in ${manifest.name}, do not publish:\n${leaks.join('\n')}`);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

    const tarball = join(
      opts.outDir,
      `${manifest.name.replace(/^@/, '').replace('/', '-')}-${manifest.version}.tgz`
    );
    execFileSync('tar', ['-czf', tarball, '-C', work, 'package']);
    return { name: manifest.name, version: manifest.version, tarball };
  });
}

/** Runs `npm <args>` and returns stdout; throws when npm exits non-zero. */
export type Exec = (args: string[]) => string;

export const npm: Exec = (args) =>
  execFileSync('npm', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** npm's refusal to publish a version that already exists. */
function alreadyPublished(error: unknown): boolean {
  const e = error as { stderr?: unknown; message?: unknown };
  const text = [e.stderr, e.message].filter((x): x is string => typeof x === 'string').join('\n');
  return /EPUBLISHCONFLICT|cannot publish over (?:the )?previously published version/i.test(text);
}

/** Whether `name@version` is on `registry`; any lookup failure counts as not published. */
export function isPublished(exec: Exec, spec: string, registry: string): boolean {
  try {
    return exec(['view', spec, 'version', '--registry', registry]).trim() !== '';
  } catch {
    return false;
  }
}

/**
 * Publishes the tarballs in order with dist-tag `alpha`. A version already on the registry is
 * skipped, so a re-run after a partial failure finishes the set instead of failing on the first.
 */
export function publishAll(
  tarballs: PackedTarball[],
  opts: {
    registry: Registry;
    exec?: Exec;
    dryRun?: boolean;
    /** npm provenance on public publishes (default true); off for a local test registry. */
    provenance?: boolean;
    /** A one-time password for npm accounts with 2FA on publish (manual releases). */
    otp?: string;
    /** Receives npm's own output for each publish (`+ name@version`, notices). */
    log?: (npmOutput: string) => void;
  }
): { published: string[]; skipped: string[] } {
  const exec = opts.exec ?? npm;
  const { target, url } = opts.registry;
  const published: string[] = [];
  const skipped: string[] = [];
  for (const t of tarballs) {
    const spec = `${t.name}@${t.version}`;
    if (opts.dryRun) {
      published.push(spec);
      continue;
    }
    if (isPublished(exec, spec, url)) {
      skipped.push(spec);
      continue;
    }
    let out: string;
    try {
      out = exec([
        'publish',
        t.tarball,
        '--tag',
        DIST_TAG,
        '--registry',
        url,
        ...(target === 'public' ? ['--access', 'public'] : []),
        ...(target === 'public' && opts.provenance !== false ? ['--provenance'] : []),
        ...(opts.otp === undefined ? [] : ['--otp', opts.otp]),
      ]);
    } catch (e) {
      // Right after a publish the registry's cache can still answer 404 to `npm view`, so a
      // re-run tries again and npm refuses: that version is out, which is all a re-run needs.
      if (alreadyPublished(e)) {
        skipped.push(spec);
        continue;
      }
      throw e;
    }
    opts.log?.(out);
    published.push(spec);
  }
  return { published, skipped };
}
