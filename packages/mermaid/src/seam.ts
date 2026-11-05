/**
 * The discovered-list seam of an API object (see discovery.ts): how discovery hands plugins to
 * the `createMermaid` instance that registered it, without widening the public API.
 */
import type { Warning } from '@mermaid-js/core';
import type { AddOptions, Mermaid } from './api.ts';
import type { DiscoveredPlugin } from './registry.ts';

/**
 * A first-use discovery source (see discovery.ts): gets the `initialize()` config and `warn`,
 * which queues a warning for the first render (a package the scan skipped).
 */
export type FirstUseSource = (
  config: Readonly<Record<string, unknown>>,
  warn: (warning: Warning) => void
) => readonly DiscoveredPlugin[] | Promise<readonly DiscoveredPlugin[]>;

/** The discovered-list seam of one API object (see discovery.ts). */
export interface Seam {
  add(list: readonly DiscoveredPlugin[], options?: AddOptions): Promise<readonly Warning[]>;
  onFirstUse(source: FirstUseSource, options?: AddOptions): void;
}

const seams = new WeakMap<object, Seam>();

/** Registers the seam of `api`; `createMermaid` calls it once per object it makes. */
export function registerSeam(api: object, seam: Seam): void {
  seams.set(api, seam);
}

/** The discovered-list seam of `api`, an object `createMermaid` made. */
export function seamOf(api: Mermaid): Seam {
  const seam = seams.get(api);
  if (!seam) throw new TypeError('Not a mermaid API object');
  return seam;
}
