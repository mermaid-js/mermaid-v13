/**
 * The explorer's only contact with mermaid: it loads the dev build (`/mermaid.esm.mjs`, rebuilt
 * from source on every change) and renders through v13's public API (`createMermaid()`,
 * `render`, `RenderResult.warnings`, `MermaidError`).
 *
 * Each build is imported once, as `/mermaid.esm.mjs?build=<n>`: after a rebuild the shell
 * passes a new `build` and gets the new code, with no page reload. Only the current and the
 * previous build stay loaded.
 */
import type * as DevBundleModule from '../mermaid.ts';
import type { MermaidError, RenderResult, Warning } from '../mermaid.ts';
import { asHostText } from '../../host-text.ts';
import { renderConfig, type RenderSettings } from './settings.ts';

/** The dev bundle's module (`src/browser/mermaid.ts`). */
export type DevBundle = typeof DevBundleModule;

/** One build: the module and a `createMermaid()` instance set up as the e2e page's (#391). */
export interface DevMermaid {
  readonly build: number;
  readonly module: DevBundle;
  readonly instance: ReturnType<DevBundle['createMermaid']>;
}

export interface BuildCache<T> {
  /** Build `build`, loaded on first use. */
  get(build: number): Promise<T>;
  /** The builds held, least recently used first. */
  builds(): number[];
}

/**
 * Loads each build once and holds the `keep` most recently used (the current build and the
 * previous one, which a render in flight may still use). A failed load is forgotten.
 */
export function createBuildCache<T>(load: (build: number) => Promise<T>, keep = 2): BuildCache<T> {
  const held = new Map<number, Promise<T>>();
  return {
    get(build) {
      let pending = held.get(build);
      if (pending) {
        held.delete(build);
      } else {
        pending = load(build);
        pending.catch(() => {
          if (held.get(build) === pending) held.delete(build);
        });
      }
      held.set(build, pending);
      for (const old of held.keys()) {
        if (held.size <= keep) break;
        held.delete(old);
      }
      return pending;
    },
    builds: () => [...held.keys()],
  };
}

const loaded = createBuildCache(async (build): Promise<DevMermaid> => {
  const url = `/mermaid.esm.mjs?build=${build}`;
  const module = (await import(/* @vite-ignore */ url)) as DevBundle;
  const instance = module.createMermaid();
  await module.setUpDevMermaid(instance);
  return { build, module, instance };
});

/** The dev build numbered `build` (0 = the one served at page load). */
export function loadMermaid(build: number): Promise<DevMermaid> {
  return loaded.get(build);
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
    const result = await instance.render(`dev-explorer-${++counter}`, asHostText(text));
    return { ok: true, result, warnings: result.warnings, ms: performance.now() - start };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    const ms = performance.now() - start;
    return isMermaidError(error)
      ? { ok: false, error, mermaidError: error, ms }
      : { ok: false, error, ms };
  }
}
