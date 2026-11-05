/**
 * Installs packed tarballs into a fresh copy of an example app (`e2e/platform/<app>/`) and
 * optionally builds it. The installed app is cached by the hash of its tarballs, its own files
 * and the package manager, so a repeated run only copies it; every call gets its own copy.
 */
import { execFileSync } from 'node:child_process';
import type { ExecFileSyncOptions } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, join, relative } from 'node:path';
import yaml from 'js-yaml';
import { cacheRoot, hashTree, sha256, withLock } from './cache.ts';
import { PLATFORM_DIR, REPO_ROOT, packageHash, packageSources, packPackages } from './pack.ts';
import type { Manifest, PackedPackage, PackOptions } from './pack.ts';

export type PackageManager = 'npm' | 'pnpm';

export interface InstallOptions extends PackOptions {
  /**
   * Packages to pack and install. Default: the app's `dependencies` and `devDependencies`
   * that are packable (workspace packages and fixtures). Their dependencies come along.
   */
  readonly packages?: readonly string[];
  /** Default `npm`. */
  readonly manager?: PackageManager;
  /** A script of the app's package.json (`build`), or a command line to run in the copy. */
  readonly build?: string | readonly string[];
  /** Extra environment for the install, the build and `run`. */
  readonly env?: Readonly<Record<string, string>>;
}

export interface InstalledApp {
  /** The app's own copy, with `node_modules` (and the build output, if built). */
  readonly dir: string;
  /** The tarballs installed, dependencies first. */
  readonly packed: readonly PackedPackage[];
  /** Runs a command in the copy and returns its stdout; throws with its output on failure. */
  run(
    command: string,
    args?: readonly string[],
    opts?: { env?: Readonly<Record<string, string>> }
  ): string;
  /** Deletes the copy (the cached install stays). */
  close(): void;
}

type Deps = Record<string, string>;

/** The folder of the installed app that holds its tarballs. */
const TARBALLS = 'tarballs';
const LOCKFILES = new Set(['package-lock.json', 'pnpm-lock.yaml']);
const skipAppFile = (name: string): boolean =>
  name === 'node_modules' || name === 'dist' || LOCKFILES.has(name);

/**
 * A folder with the monorepo's `esbuild` executable itself, not pnpm's `.bin/esbuild` shim:
 * the shim exports `NODE_PATH` with the monorepo's `node_modules/.pnpm/node_modules`, through
 * which esbuild resolved an import the installed packages do not declare to the workspace
 * sources (`packages/core`), so a missing dependency went unnoticed.
 */
function toolsBin(): string {
  const bin = join(cacheRoot(), 'bin');
  const esbuild = join(bin, 'esbuild');
  if (!existsSync(esbuild)) {
    mkdirSync(bin, { recursive: true });
    const real = realpathSync(join(REPO_ROOT, 'node_modules', 'esbuild', 'bin', 'esbuild'));
    try {
      symlinkSync(real, esbuild);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }
  return bin;
}

/**
 * The environment of the app's commands: without the npm and pnpm variables of the
 * `pnpm e2e` that started Playwright and without `NODE_PATH`, with the monorepo's esbuild
 * ({@link toolsBin}) first and its `node_modules/.bin` last on PATH, so a build can use a tool
 * the app does not install itself, and never resolves a package from the monorepo.
 */
export function appEnv(extra: Readonly<Record<string, string>> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env))
    if (!/^(?:npm|pnpm)_/i.test(k) && k !== 'INIT_CWD' && k !== 'NODE_PATH') env[k] = v;
  // First: `pnpm e2e` puts the monorepo's `.bin` (with the shim) at the front of PATH.
  env.PATH = [toolsBin(), env.PATH, join(REPO_ROOT, 'node_modules', '.bin')]
    .filter(Boolean)
    .join(delimiter);
  return { ...env, ...extra };
}

function exec(command: string, args: readonly string[], opts: ExecFileSyncOptions): string {
  try {
    return execFileSync(command, args, {
      ...opts,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    throw new Error(
      `${command} ${args.join(' ')} failed in ${String(opts.cwd)}:\n` +
        `${err.stdout ?? ''}${err.stderr ?? err.message}`
    );
  }
}

/**
 * The app's package.json with every packed package it lists pointing at its tarball, and
 * (npm) overrides that send the ones it does not list, the dependencies of dependencies,
 * there too. npm names a direct dependency in overrides as `$name`. pnpm's overrides go in
 * `pnpm-workspace.yaml` instead.
 */
export function installManifest(
  app: Manifest,
  packed: readonly PackedPackage[],
  manager: PackageManager
): Manifest {
  const file = new Map(packed.map((p) => [p.name, `file:${p.tarball}`]));
  const devDependencies = app.devDependencies as Deps | undefined;
  const pin = (deps: Deps | undefined): Deps | undefined =>
    deps && Object.fromEntries(Object.entries(deps).map(([n, r]) => [n, file.get(n) ?? r]));
  const direct = new Set(Object.keys({ ...app.dependencies, ...devDependencies }));
  const overrides = Object.fromEntries(
    packed.map((p) => [p.name, direct.has(p.name) ? `$${p.name}` : `file:${p.tarball}`])
  );
  const out: Manifest = {
    ...app,
    dependencies: pin(app.dependencies),
    devDependencies: pin(devDependencies),
  };
  if (manager === 'npm') out.overrides = { ...(app.overrides as Deps | undefined), ...overrides };
  return out;
}

/**
 * Dependencies whose install scripts may run. pnpm 11+ fails an install with
 * `ERR_PNPM_IGNORED_BUILDS` on any unapproved script (esbuild's postinstall); `allowBuilds`
 * is the key pnpm 10.26+, 11 and 12 all read (11+ ignore `onlyBuiltDependencies`). Which
 * pnpm runs depends on the machine (Homebrew, corepack's latest in the Playwright image).
 */
export const ALLOW_BUILDS: Readonly<Record<string, boolean>> = { esbuild: true };

interface PnpmWorkspaceConfig {
  overrides?: Deps;
  allowBuilds?: Record<string, boolean>;
}

/**
 * The app's `pnpm-workspace.yaml`: its own settings, the tarballs as overrides (pnpm reads
 * overrides from there only) and {@link ALLOW_BUILDS}.
 */
export function pnpmWorkspaceConfig(
  config: PnpmWorkspaceConfig | null,
  packed: readonly PackedPackage[]
): PnpmWorkspaceConfig {
  const overrides = Object.fromEntries(packed.map((p) => [p.name, `file:${p.tarball}`]));
  return {
    ...config,
    overrides: { ...config?.overrides, ...overrides },
    allowBuilds: { ...ALLOW_BUILDS, ...config?.allowBuilds },
  };
}

function pnpmWorkspace(dir: string, packed: readonly PackedPackage[]): void {
  const file = join(dir, 'pnpm-workspace.yaml');
  const config = (
    existsSync(file) ? yaml.load(readFileSync(file, 'utf8')) : null
  ) as PnpmWorkspaceConfig | null;
  writeFileSync(file, yaml.dump(pnpmWorkspaceConfig(config, packed), { lineWidth: -1 }));
}

const INSTALL_ARGS: Record<PackageManager, string[]> = {
  npm: ['install', '--prefer-offline', '--no-audit', '--no-fund', '--loglevel=error'],
  pnpm: ['install', '--prefer-offline', '--reporter=append-only'],
};

/**
 * Throws unless every installed copy of a packed package is that tarball. A copy from the
 * registry (a published alpha with the same version) would test the wrong code: pnpm, for
 * one, does not apply overrides to the peers it installs by itself.
 */
export function assertInstalledFromTarballs(dir: string, packed: readonly PackedPackage[]): void {
  const want = new Map(packed.map((p) => [p.name, p.hash]));
  const wrong: string[] = [];
  const found = new Set<string>();
  const visit = (at: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sub = join(at, entry.name);
      const manifest = join(sub, 'package.json');
      if (existsSync(manifest)) {
        const { name } = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string };
        const hash = name === undefined ? undefined : want.get(name);
        if (hash !== undefined) {
          found.add(name!);
          if (packageHash(sub) !== hash) wrong.push(`${name} at ${relative(dir, sub)}`);
        }
      }
      visit(sub);
    }
  };
  visit(join(dir, 'node_modules'));
  if (wrong.length > 0)
    throw new Error(
      `Installed packages that are not the packed tarballs (from the registry?):\n${wrong.join('\n')}`
    );
  const missing = packed.filter((p) => !found.has(p.name)).map((p) => p.name);
  if (missing.length > 0) throw new Error(`Packed but not installed: ${missing.join(', ')}`);
}

/** The cached install of `app` for these tarballs, created on first use. */
function cachedInstall(
  app: string,
  manifest: Manifest,
  packed: readonly PackedPackage[],
  opts: InstallOptions
): string {
  const source = join(PLATFORM_DIR, app);
  const manager = opts.manager ?? 'npm';
  const key = sha256(
    [
      manager,
      // The harness itself: a change to how it installs makes a new install.
      hashTree(import.meta.dirname),
      hashTree(source, skipAppFile),
      ...packed.map((p) => `${p.name}:${p.hash}`),
    ].join('\n')
  ).slice(0, 32);
  const apps = join(cacheRoot(), 'apps');
  const installed = join(apps, `${app}-${manager}-${key}`);
  if (existsSync(installed)) return installed;
  withLock(`install-${key}`, () => {
    if (existsSync(installed)) return;
    mkdirSync(apps, { recursive: true });
    const staging = mkdtempSync(`${installed}.tmp-`);
    try {
      cpSync(source, staging, { recursive: true, filter: (src) => !skipAppFile(basename(src)) });
      // The tarballs go inside the app, named by relative paths: short (pnpm's store keys
      // file: specs by path) and still right in every copy.
      mkdirSync(join(staging, TARBALLS));
      const local = packed.map((p) => {
        cpSync(p.tarball, join(staging, TARBALLS, basename(p.tarball)));
        return { ...p, tarball: `./${TARBALLS}/${basename(p.tarball)}` };
      });
      writeFileSync(
        join(staging, 'package.json'),
        `${JSON.stringify(installManifest(manifest, local, manager), null, 2)}\n`
      );
      if (manager === 'pnpm') pnpmWorkspace(staging, local);
      exec(manager, INSTALL_ARGS[manager], { cwd: staging, env: appEnv(opts.env) });
      assertInstalledFromTarballs(staging, packed);
      renameSync(staging, installed);
    } catch (e) {
      rmSync(staging, { recursive: true, force: true });
      throw e;
    }
  });
  return installed;
}

/**
 * Packs the app's packages (see {@link InstallOptions.packages}), installs the tarballs into
 * a copy of `e2e/platform/<app>/` and runs `build`. Throws with the tool's output when the
 * pack, the install or the build fails.
 */
export function installApp(app: string, opts: InstallOptions = {}): InstalledApp {
  const source = join(PLATFORM_DIR, app);
  if (!existsSync(join(source, 'package.json'))) throw new Error(`No app at ${source}`);
  const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')) as Manifest;
  const packable = packageSources();
  const listed = Object.keys({ ...manifest.dependencies, ...(manifest.devDependencies as Deps) });
  const packed = packPackages(opts.packages ?? listed.filter((n) => packable.has(n)), opts);
  const installed = cachedInstall(app, manifest, packed, opts);

  const dir = mkdtempSync(join(tmpdir(), `mermaid-platform-${app}-`));
  cpSync(installed, dir, { recursive: true, verbatimSymlinks: true });
  const run: InstalledApp['run'] = (command, args = [], runOpts = {}) =>
    exec(command, args, { cwd: dir, env: appEnv({ ...opts.env, ...runOpts.env }) });
  const close = (): void => rmSync(dir, { recursive: true, force: true });
  try {
    if (typeof opts.build === 'string') run(opts.manager ?? 'npm', ['run', opts.build]);
    else if (opts.build !== undefined) run(opts.build[0], opts.build.slice(1));
  } catch (e) {
    close();
    throw e;
  }
  return { dir, packed, run, close };
}
