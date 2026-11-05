/// <reference types="node" />
/**
 * `@mermaid-js/bundler-plugin` (D164, R-PLUG-5): one line in a Vite, webpack, Rollup or
 * esbuild config, `plugins: [mermaid()]`, and the Mermaid plugins installed in the app's own
 * `node_modules` render with no registration code. The plugin replaces `mermaid`'s empty
 * `mermaid/discovered` module with one generated from a build-time scan of the bundler's project
 * root (`generate.ts`). Without it, nothing changes.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createUnplugin, type UnpluginFactory, type UnpluginInstance } from 'unplugin';
import { discoveredModule, type DiscoveredModule } from './generate.ts';

export interface MermaidPluginOptions {
  /**
   * Where to look for the app's package.json, whose `node_modules` is scanned. Default: the
   * bundler's project root (Vite `root`, webpack `context`, esbuild `absWorkingDir`), else
   * `process.cwd()` (Rollup).
   */
  readonly root?: string;
}

/** `mermaid`'s `discovered` module: `dist/discovered.js`, or its source in this workspace. */
const DISCOVERED = /[\\/]mermaid[\\/](?:dist[\\/]discovered\.js|src[\\/]discovered\.ts)$/;

const packageNames = new Map<string, string | undefined>();

/** Whether `id` is the `discovered` module of the `mermaid` package (not a look-alike path). */
function isDiscovered(id: string): boolean {
  const file = id.replace(/[?#].*$/, '');
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
        const { code, warnings } = await scan();
        if (!warned) {
          warned = true;
          for (const w of warnings) this.warn(`[mermaid] ${w.message}`);
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
    // Typed by hand: unplugin's compiler types need webpack's, which this package does not load.
    webpack(compiler: { readonly context: string }) {
      bundlerRoot = compiler.context;
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
