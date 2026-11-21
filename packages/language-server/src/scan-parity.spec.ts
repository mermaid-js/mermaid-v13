/**
 * One scan for rendering and the editor (D577, D589, #808): the shared fixture workspace
 * through `@mermaid-js/plugin-autoload` (its scan, and `autoload` itself on a `mermaid`
 * instance) and through `discoverFacets`. The server accepts what the scan accepts and skips
 * what it skips, with the scan's own warnings. Packages the scan finds and `autoload` then
 * drops (a first-party id, an id an earlier package holds, a detector that does not load, D166)
 * the server drops too, for the same reason.
 */
import { autoload, FIRST_PARTY_IDS, scanPlugins } from '@mermaid-js/plugin-autoload';
import { createMermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { discoverFacets } from './facets.ts';
import { scanFixtureWorkspace } from './testing/scan-fixtures.ts';

/**
 * Found by the scan, then dropped by `autoload` (its loader and the registry), and why, in the
 * server's words. The test below checks that `autoload` drops exactly these packages.
 */
const RENDER_DROPS: Readonly<Record<string, string>> = {
  'claims-flowchart-v2': '"flowchart-v2" is a first-party diagram id or type',
  'claims-sequence': '"sequence" is a first-party diagram id or type',
  'dup-b': 'diagram "dup" belongs to "dup-a"',
  'throwing-detector': 'detector failed to load (boom)',
  'detector-not-a-function': 'the detector module exports no function',
};

const packageOf = (message: string): string => message.slice(0, message.indexOf(': '));

describe('the render scan and the server discovery (D577)', () => {
  it('accept and skip the same packages of one workspace', async () => {
    const root = scanFixtureWorkspace();
    const scan = await scanPlugins(root, { firstPartyIds: FIRST_PARTY_IDS });
    const log: string[] = [];
    const facets = await discoverFacets(root, { log: (m) => log.push(m) });

    const kept = scan.packages.filter((p) => !(p.package in RENDER_DROPS));
    expect(facets.map((f) => f.id)).toEqual(kept.map((p) => p.manifest.id));
    expect(facets.map((f) => f.id)).toEqual(['scoped', 'dotted', 'dup', 'good']);

    const scanSkips = scan.warnings.flatMap((w) => ('package' in w ? [w.package] : []));
    const skipped = [...scanSkips, ...Object.keys(RENDER_DROPS)];
    expect([...new Set(log.map(packageOf))].sort()).toEqual(skipped.sort());
    expect(log).toEqual(expect.arrayContaining(scan.warnings.map((w) => w.message)));
    for (const [pkg, why] of Object.entries(RENDER_DROPS)) expect(log).toContain(`${pkg}: ${why}`);
  });

  it('skip the same packages: autoload on a mermaid instance drops what the server drops', async () => {
    const root = scanFixtureWorkspace();
    const log: string[] = [];
    await discoverFacets(root, { log: (m) => log.push(m) });
    const warnings = await autoload(createMermaid(), { root });
    const dropped = (names: Iterable<string>) => [...new Set(names)].sort();
    expect(dropped(warnings.flatMap((w) => ('package' in w ? [w.package] : [])))).toEqual(
      dropped(log.map(packageOf))
    );
  });

  it('agree on the cases where the old server scan did not', async () => {
    const root = scanFixtureWorkspace();
    const log: string[] = [];
    const facets = await discoverFacets(root, { log: (m) => log.push(m) });
    const byId = new Map(facets.map((f) => [f.id, f]));
    // A module named `..detector.js` is inside its package.
    expect(byId.has('dotted')).toBe(true);
    // An id `readManifest` rejects skips the package.
    expect(byId.has('Bad Id!')).toBe(false);
    expect(log.some((m) => m.startsWith('bad-id: Invalid mermaid plugin manifest'))).toBe(true);
    // Two packages with one id: the first by package name, whatever the directory order.
    expect(byId.get('dup')!.detector('dup-a\n')).toBe(true);
    expect(byId.get('dup')!.detector('dup-b\n')).toBe(false);
  });
});
