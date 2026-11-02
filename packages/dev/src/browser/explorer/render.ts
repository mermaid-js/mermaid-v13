/**
 * The explorer's only contact with mermaid: it loads the dev build (`/mermaid.esm.mjs`, rebuilt
 * from source on every change) and renders through v13's public API (`createMermaid()`,
 * `render`, `RenderResult.warnings`, `MermaidError`).
 *
 * Each build is imported once, as `/mermaid.esm.mjs?build=<n>`: after a rebuild the shell
 * passes a new `build` and gets the new code, with no page reload.
 */
import type * as DevBundleModule from '../mermaid.ts';
import type { MermaidError, RenderResult, Warning } from '../mermaid.ts';
import { renderConfig, type RenderSettings } from './settings.ts';

/** The dev bundle's module (`src/browser/mermaid.ts`). */
export type DevBundle = typeof DevBundleModule;

/** One build: the module and a `createMermaid()` instance with the interactions plugin. */
export interface DevMermaid {
  readonly build: number;
  readonly module: DevBundle;
  readonly instance: ReturnType<DevBundle['createMermaid']>;
}

const loaded = new Map<number, Promise<DevMermaid>>();

/** The dev build numbered `build` (0 = the one served at page load). */
export function loadMermaid(build: number): Promise<DevMermaid> {
  let pending = loaded.get(build);
  if (!pending) {
    pending = (async () => {
      const url = `/mermaid.esm.mjs?build=${build}`;
      const module = (await import(/* @vite-ignore */ url)) as DevBundle;
      const instance = module.createMermaid();
      instance.registerLayoutLoaders(module.devLayoutLoaders);
      await instance.registerExternalDiagrams([module.interactions]);
      return { build, module, instance };
    })();
    pending.catch(() => loaded.delete(build));
    loaded.set(build, pending);
  }
  return pending;
}

/** What one render produced: the result, or the error. */
export type RenderOutcome =
  | {
      readonly ok: true;
      readonly result: RenderResult;
      readonly warnings: readonly Warning[];
      readonly ms: number;
    }
  | {
      readonly ok: false;
      readonly error: Error;
      /**
       * The same error when mermaid threw a `MermaidError`: `code`, 1-based `line`/`column`
       * and every `diagnostics` entry (#60's Messages panel lists them).
       */
      readonly mermaidError?: MermaidError;
      readonly ms: number;
    };

const isMermaidError = (e: unknown): e is MermaidError =>
  e instanceof Error && e.name === 'MermaidError' && 'code' in e;

let counter = 0;

/** Renders `text` with `settings` through the dev build `build`. Never throws. */
export async function renderText(
  text: string,
  settings: RenderSettings,
  build = 0
): Promise<RenderOutcome> {
  const start = performance.now();
  try {
    const { instance } = await loadMermaid(build);
    // `render` reads the site config when called, so initialize + render can't interleave.
    instance.initialize(renderConfig(settings));
    const result = await instance.render(`dev-explorer-${++counter}`, text);
    return { ok: true, result, warnings: result.warnings, ms: performance.now() - start };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    const ms = performance.now() - start;
    return isMermaidError(error)
      ? { ok: false, error, mermaidError: error, ms }
      : { ok: false, error, ms };
  }
}
