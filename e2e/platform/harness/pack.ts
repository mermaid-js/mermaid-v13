/**
 * Packs packages the way they are published: the workspace's published packages (built
 * first) and the fixture plugins under `e2e/platform/fixtures/`, each with `pnpm pack`, which
 * applies `files` and rewrites `workspace:` ranges. Asking for `mermaid` packs everything it
 * depends on, so an install never needs the registry for a first-party package.
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { cacheRoot, canonicalJson, hashTree, sha256, withLock } from './cache.ts';

export const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
/** Where the example apps live: `e2e/platform/<app>/`. */
export const PLATFORM_DIR = join(REPO_ROOT, 'e2e', 'platform');
/** The fixture plugins, one package per folder. */
export const FIXTURES_DIR = join(PLATFORM_DIR, 'fixtures');
/** The fixture third-party diagram: id `fixturebox`, detector and entry by manifest. */
export const FIXTURE_DIAGRAM = 'mermaid-fixture-diagram';
/** The fixture extension: id `fixture-mark`, adds the class `fixture-mark` to every svg. */
export const FIXTURE_EXTENSION = 'mermaid-fixture-extension';

type Deps = Record<string, string>;

export interface Manifest {
  name: string;
  version: string;
  private?: boolean;
  dependencies?: Deps;
  peerDependencies?: Deps;
  optionalDependencies?: Deps;
  files?: string[];
  exports?: unknown;
  mermaid?: unknown;
  [key: string]: unknown;
}

/** A package the harness can pack. */
export interface PackageSource {
  readonly name: string;
  readonly dir: string;
  readonly manifest: Manifest;
  /** A workspace package (built before packing) rather than a fixture. */
  readonly workspace: boolean;
}

/** A packed tarball in the cache. */
export interface PackedPackage {
  readonly name: string;
  readonly version: string;
  /** Absolute path of the `.tgz`. */
  readonly tarball: string;
  /** Hash of the tarball's files (package.json key order ignored). */
  readonly hash: string;
}

/** Returns the packed package.json of one package, edited; `files` is applied again afterwards. */
export type ManifestEdit = (manifest: Manifest) => Manifest;

export interface PackOptions {
  /**
   * Per package name, an edit of its packed manifest, to show that a packaging mistake
   * (`exports`, `files`, a dependency) breaks the app. The package is re-packed with
   * `npm pack`, so a narrower `files` drops files.
   */
  readonly edit?: Readonly<Record<string, ManifestEdit>>;
}

const readManifest = (dir: string): Manifest =>
  JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Manifest;

function children(dir: string): string[] {
  return existsSync(dir)
    ? readdirSync(dir)
        .map((name) => join(dir, name))
        .filter((d) => existsSync(join(d, 'package.json')))
    : [];
}

/** Every packable package by name: the published workspace packages and the fixtures. */
export function packageSources(): Map<string, PackageSource> {
  const sources = new Map<string, PackageSource>();
  for (const dir of children(join(REPO_ROOT, 'packages'))) {
    const manifest = readManifest(dir);
    if (!manifest.private)
      sources.set(manifest.name, { name: manifest.name, dir, manifest, workspace: true });
  }
  for (const dir of children(FIXTURES_DIR)) {
    const manifest = readManifest(dir);
    sources.set(manifest.name, { name: manifest.name, dir, manifest, workspace: false });
  }
  return sources;
}

/**
 * `names` and every package they depend on (dependencies, peer and optional dependencies,
 * not devDependencies) that is itself packable, each after its own dependencies.
 */
export function packClosure(
  names: readonly string[],
  sources: ReadonlyMap<string, PackageSource> = packageSources()
): PackageSource[] {
  const ordered: PackageSource[] = [];
  const visit = (name: string, from?: string): void => {
    const source = sources.get(name);
    if (source === undefined) {
      if (from === undefined) throw new Error(`Not a packable package: ${name}`);
      return;
    }
    if (ordered.includes(source)) return;
    const { dependencies = {}, peerDependencies = {}, optionalDependencies = {} } = source.manifest;
    for (const dep of Object.keys({
      ...peerDependencies,
      ...optionalDependencies,
      ...dependencies,
    }).sort())
      visit(dep, name);
    if (!ordered.includes(source)) ordered.push(source);
  };
  for (const name of names) visit(name);
  return ordered;
}

const skipBuildInput = (name: string): boolean =>
  name === 'node_modules' || name === 'dist' || name.endsWith('.spec.ts');

/**
 * Builds the workspace packages among `sources` (`pnpm --filter … run build`), unless the
 * same sources were already built in this checkout.
 */
export function buildWorkspace(sources: readonly PackageSource[]): void {
  const workspace = sources.filter((s) => s.workspace);
  if (workspace.length === 0) return;
  const stamp = sha256(
    [REPO_ROOT, ...workspace.map((s) => `${s.name}:${hashTree(s.dir, skipBuildInput)}`)].join('\n')
  );
  const marker = join(cacheRoot(), 'builds', stamp);
  const built = (): boolean =>
    existsSync(marker) && workspace.every((s) => existsSync(join(s.dir, 'dist')));
  if (built()) return;
  withLock('build', () => {
    if (built()) return;
    execFileSync('pnpm', [...workspace.flatMap((s) => ['--filter', s.name]), 'run', 'build'], {
      cwd: REPO_ROOT,
      stdio: 'pipe',
    });
    mkdirSync(join(cacheRoot(), 'builds'), { recursive: true });
    writeFileSync(marker, '');
  });
}

const tgzName = (m: Manifest): string =>
  `${m.name.replace(/^@/, '').replace('/', '-')}-${m.version}.tgz`;

function workspaceLeaks(m: Manifest): string[] {
  return (['dependencies', 'peerDependencies', 'optionalDependencies'] as const).flatMap((field) =>
    Object.entries(m[field] ?? {})
      .filter(([, range]) => range.startsWith('workspace:'))
      .map(([dep, range]) => `${field}.${dep}: ${range}`)
  );
}

/**
 * The hash of a package directory as packed or installed (`PackedPackage.hash`): its files
 * without `node_modules`, package.json key order ignored.
 */
export function packageHash(dir: string): string {
  return hashTree(
    dir,
    (name) => name === 'node_modules',
    (path, content) =>
      path === 'package.json' ? canonicalJson(JSON.parse(content.toString('utf8'))) : content
  );
}

function packOne(source: PackageSource, edit: ManifestEdit | undefined): PackedPackage {
  const work = mkdtempSync(join(cacheRoot(), 'pack-'));
  try {
    execFileSync('pnpm', ['pack', '--pack-destination', work], { cwd: source.dir, stdio: 'pipe' });
    const packed = readdirSync(work).find((f) => f.endsWith('.tgz'));
    if (packed === undefined) throw new Error(`pnpm pack wrote no tarball for ${source.name}`);
    let tarball = join(work, packed);
    const pkg = join(work, 'package');
    execFileSync('tar', ['-xzf', tarball, '-C', work]);
    let manifest = readManifest(pkg);
    if (edit !== undefined) {
      manifest = edit(manifest);
      writeFileSync(join(pkg, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
      const out = join(work, 'edited');
      mkdirSync(out);
      execFileSync('npm', ['pack', '--ignore-scripts', '--pack-destination', out], {
        cwd: pkg,
        stdio: 'pipe',
      });
      tarball = join(out, readdirSync(out)[0]);
      rmSync(pkg, { recursive: true });
      mkdirSync(pkg);
      execFileSync('tar', ['-xzf', tarball, '-C', work]);
      manifest = readManifest(pkg);
    }
    const leaks = workspaceLeaks(manifest);
    if (leaks.length > 0)
      throw new Error(`${source.name}: workspace ranges survived packing:\n${leaks.join('\n')}`);
    const hash = packageHash(pkg);
    const dir = join(cacheRoot(), 'tarballs', hash.slice(0, 32));
    const target = join(dir, tgzName(manifest));
    if (!existsSync(target)) {
      mkdirSync(dir, { recursive: true });
      const tmp = `${target}.${process.pid}.tmp`;
      cpSync(tarball, tmp);
      renameSync(tmp, target);
    }
    return { name: manifest.name, version: manifest.version, tarball: target, hash };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/**
 * `packOne`, skipped when the package's files and the versions its `workspace:` ranges turn
 * into are the same as for a tarball already in the cache. Edited packs are never reused.
 */
function packCached(
  source: PackageSource,
  edit: ManifestEdit | undefined,
  versions: string
): PackedPackage {
  if (edit !== undefined) return packOne(source, edit);
  const key = sha256([source.name, versions, hashTree(source.dir, skipPackInput)].join('\n'));
  const record = join(cacheRoot(), 'packs', `${key.slice(0, 32)}.json`);
  if (existsSync(record)) {
    const packed = JSON.parse(readFileSync(record, 'utf8')) as PackedPackage;
    if (existsSync(packed.tarball)) return packed;
  }
  const packed = packOne(source, edit);
  mkdirSync(join(cacheRoot(), 'packs'), { recursive: true });
  const tmp = `${record}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(packed));
  renameSync(tmp, record);
  return packed;
}

const skipPackInput = (name: string): boolean => name === 'node_modules';

/**
 * Packs `names` and their packable dependencies (workspace packages are built first) and
 * returns the tarballs, dependencies first. Throws when a `workspace:` range survives.
 */
export function packPackages(names: readonly string[], opts: PackOptions = {}): PackedPackage[] {
  const all = packageSources();
  const sources = packClosure(names, all);
  buildWorkspace(sources);
  const versions = [...all.values()].map((s) => `${s.name}@${s.manifest.version}`).join(',');
  return sources.map((s) => packCached(s, opts.edit?.[s.name], versions));
}
