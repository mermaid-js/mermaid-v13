/**
 * One scan for rendering and the editor (D577, #808): the shared fixture workspace through the
 * render scan (`scanPlugins`, as `mermaid` in Node runs it) and through `discoverFacets`. The
 * server accepts what the scan accepts and skips what it skips, with the scan's own warnings.
 * Packages the scan finds and the render then drops (a first-party id, an id an earlier
 * package holds, a detector that does not load, D166) the server drops too, for the same reason.
 */
import { FIRST_PARTY_IDS, scanPlugins } from 'mermaid/node-scan';
import { describe, expect, it } from 'vitest';
import { discoverFacets } from './facets.ts';
import { scanFixtureWorkspace } from './testing/scan-fixtures.ts';

/**
 * Found by the scan, then dropped by the render (registry and Node discovery), and why. Written
 * by hand: the render's own drops cannot run from here without new public API. Node discovery
 * (`nodeDiscovery` in mermaid's `node.ts`) is reached only through the `node` condition of
 * `mermaid`, which the `mermaid-source` condition these specs resolve with replaces by
 * `index.ts`, and it scans from `process.cwd()`; the duplicate-id and first-party drops happen
 * in the registry when a render registers discovered plugins, which no export exposes. The
 * messages here are the ones `mermaid/src/node.ts` and `registry.ts` write.
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
