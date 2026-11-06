/**
 * Checks on this workspace that the release rehearsal would otherwise catch only after a build,
 * a pack and a local registry: run in `pnpm test`, so a new package or facet can't break it.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { firstPartyFacets } from '../../../packages/language-service/src/generated/facets.gen.ts';
import { FACET_PEERS } from './adapters-check.ts';
import { publishedPackages } from './publish.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const published = publishedPackages(ROOT);

describe('published packages in this workspace', () => {
  it.each(published.map((p) => [p.manifest.name, p.dir] as const))(
    '%s has a README.md for its npm page',
    (_name, dir) => {
      expect(existsSync(join(dir, 'README.md'))).toBe(true);
    }
  );

  it("installs the language service's facet peers by package name, one per loaded facet", () => {
    const names = new Set(published.map((p) => p.manifest.name));
    for (const peer of FACET_PEERS) expect(names, peer).toContain(peer);
    const loaded = new Set(firstPartyFacets.filter((e) => e.load !== undefined).map((e) => e.id));
    expect(FACET_PEERS).toHaveLength(loaded.size);
  });
});
