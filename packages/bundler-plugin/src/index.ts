/// <reference types="node" />
/**
 * `@mermaid-js/bundler-plugin` (D164, R-PLUG-5): one line in a Vite, webpack, Rollup or
 * esbuild config, `plugins: [mermaid()]`, and the Mermaid plugins installed in the app's own
 * `node_modules` render with no registration code. The plugin replaces `mermaid`'s empty
 * `mermaid/discovered` module with one generated from a build-time scan of the bundler's project
 * root (`generate.ts`). Without it, nothing changes.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createUnplugin, type UnpluginFactory, type UnpluginInstance } from 'unplugin';
import { discoveredModule, INSTALL_MARKERS, type DiscoveredModule } from './generate.ts';

export interface MermaidPluginOptions {
  /**
   * Where to look for the app's package.json, whose `node_modules` is scanned. Default: the
   * bundler's project root (Vite `root`, webpack `context`, esbuild `absWorkingDir`), else
   * `process.cwd()` (Rollup).
   */
  readonly root?: string;
}

/**
 * `mermaid`'s `discovered` module: `dist/discovered.js`, or its source in this workspace, with
 * an optional `?query` (Vite dev ids).
 */
const DISCOVERED =
  /[\\/]mermaid[\\/](?:dist[\\/]discovered\.js|src[\\/]discovered\.ts)(?:\?[^/\\]*)?$/;

/** `id` without a trailing `?query`; a `#` or `?` inside the path stays (`/home/u/C#/app`). */
const withoutQuery = (id: string): string => id.replace(/\?[^/\\]*$/, '');

const packageNames = new Map<string, string | undefined>();

/** Whether `id` is the `discovered` module of the `mermaid` package (not a look-alike path). */
function isDiscovered(id: string): boolean {
  const file = withoutQuery(id);
  if (!DISCOVERED.test(file)) return false;
  const manifest = join(dirname(dirname(file)), 'package.json');
  if (!packageNames.has(manifest)) {
    let name: string | undefined;
    try {
      name = (JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string }).name;
    } catch {
      name = undefined;
    }
    packageNames.set(manifest, name);
  }
  return packageNames.get(manifest) === 'mermaid';
}

/** The nearest directory at or above `from` with a package.json (sync: webpack's apply). */
function nearestPackageDir(from: string): string | undefined {
  for (let dir = from; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    if (dirname(dir) === dir) return undefined;
  }
}

/** The subset of webpack's compiler this plugin uses (typed by hand: no webpack types here). */
interface WebpackCompiler {
  readonly context: string;
  readonly options: {
    cache?: false | { type?: string; buildDependencies?: Record<string, string[]> };
  };
}

const factory: UnpluginFactory<MermaidPluginOptions | undefined, false> = (options = {}) => {
  let bundlerRoot: string | undefined;
  let found: Promise<DiscoveredModule> | undefined;
  let warned = false;
  const scan = (): Promise<DiscoveredModule> =>
    (found ??= discoveredModule(options.root ?? bundlerRoot ?? process.cwd()));
  return {
    name: 'mermaid',
    enforce: 'pre',
    buildStart() {
      // Every build (and watch rebuild) scans again.
      found = undefined;
      warned = false;
    },
    load: {
      filter: { id: DISCOVERED },
      async handler(id) {
        if (!isDiscovered(id)) return null;
        const { code, warnings, watchFiles, watchDirs } = await scan();
        if (!warned) {
          warned = true;
          for (const w of warnings) this.warn(`[mermaid] ${w}`);
        }
        // Watch mode and persistent caches (webpack, Vite dev) rebuild this module when a
        // package is installed, removed or changed.
        const native = this.getNativeBuildContext?.();
        for (const file of watchFiles) this.addWatchFile(file);
        if (native?.framework === 'webpack') {
          // Folders are context dependencies in webpack (typed by hand: no webpack types here).
          const loader = native.loaderContext as
            | { addContextDependency(dir: string): void }
            | undefined;
          for (const dir of watchDirs) loader?.addContextDependency(dir);
        } else if (native?.framework !== 'esbuild') {
          // Rollup and Vite watch folders too; esbuild's watchFiles take files only.
          for (const dir of watchDirs) this.addWatchFile(dir);
        }
        return code;
      },
    },
    vite: {
      configResolved(config) {
        bundlerRoot = config.root;
      },
      // The dev server pre-bundles dependencies without plugins: keep `mermaid` out of it so
      // its `discovered` module goes through this plugin.
      config: () => ({ optimizeDeps: { exclude: ['mermaid'] } }),
    },
    webpack(compiler: WebpackCompiler) {
      bundlerRoot = compiler.context;
      // A persistent cache is invalidated when the app's package.json or an install marker
      // changes, so a plugin installed or removed between runs is seen (Next.js caches).
      const cache = compiler.options.cache;
      const dir = nearestPackageDir(options.root ?? compiler.context);
      if (cache && cache.type === 'filesystem' && dir !== undefined) {
        const files = [
          join(dir, 'package.json'),
          ...INSTALL_MARKERS.map((m) => join(dir, 'node_modules', m)),
        ].filter((f) => existsSync(f));
        cache.buildDependencies = { ...cache.buildDependencies, mermaidPlugins: files };
      }
    },
    esbuild: {
      config(build) {
        bundlerRoot = build.absWorkingDir;
      },
    },
  };
};

/** The plugin for every bundler unplugin supports: `.vite()`, `.webpack()`, `.rollup()`, … */
export const unplugin: UnpluginInstance<MermaidPluginOptions | undefined, false> =
  createUnplugin(factory);

export { discoveredModule, type DiscoveredModule } from './generate.ts';
