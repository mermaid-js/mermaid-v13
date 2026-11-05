/**
 * R-PLUG-8: core's size does not depend on whether the optional packages are installed. The
 * core budget's entry (`packages/mermaid/size-budget.json`, D161) is bundled twice with the size
 * job's production options: once with every optional package installed (resolvable by name from
 * every module, as in an app's node_modules) and once with all of them hidden (resolving one
 * fails the build). Both builds must produce the same bytes. The optional set comes from the
 * manifests (`findOptionalPackages`), so M4's packages join it unchanged (D170).
 */
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ClosureSize } from '../../packages/bench/src/size-budget.ts';
import {
  checkBudget,
  fileDigests,
  measureStaticClosure,
  readSizeBudget,
} from '../../packages/bench/src/size-budget.ts';
import { findOptionalPackages, readWorkspace } from './check-deps.ts';

const root = join(import.meta.dirname, '..', '..');
const optional = findOptionalPackages(readWorkspace(root));
const installed = optional.map((p) => ({ name: p.manifest.name, dir: join(root, p.dir) }));
const hidden = optional.map((p) => p.manifest.name);
const budget = readSizeBudget();

let present: ClosureSize;
let absent: ClosureSize;

beforeAll(async () => {
  [present, absent] = await Promise.all([
    measureStaticClosure(budget.core.entry, undefined, { installed }),
    measureStaticClosure(budget.core.entry, undefined, { hidden }),
  ]);
}, 120_000);

describe('core is unaffected by optional packages (R-PLUG-8, D170)', () => {
  it('measures with and without ELK and math', () => {
    expect(hidden).toEqual(
      expect.arrayContaining(['@mermaid-js/layout-elk', '@mermaid-js/plugin-math'])
    );
  });

  it("keeps core's bundle bytes identical with and without the optional packages", () => {
    expect(present.size.files.map((f) => f.path)).toEqual(absent.size.files.map((f) => f.path));
    expect(present.size.gzip).toBe(absent.size.gzip);
    expect(present.size.raw).toBe(absent.size.raw);
    // Every output file, lazily imported chunks included, byte for byte.
    expect(fileDigests(present.bundle)).toEqual(fileDigests(absent.bundle));
    const check = checkBudget(absent.size, budget.core);
    expect(check, check.detail).toMatchObject({ ok: true });
  });

  describe('a fixture entry that imports an optional package', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'mermaid-optional-')));
    const fixture = join(dir, 'imports-elk.ts');
    writeFileSync(fixture, "export const load = () => import('@mermaid-js/layout-elk');\n");

    it('bundles it when the packages are installed', async () => {
      const { bundle } = await measureStaticClosure(fixture, undefined, { installed });
      const inputs = Object.values(bundle.graph).flatMap((n) => n.inputs);
      expect(inputs.some((i) => i.startsWith('packages/layout-elk/src/'))).toBe(true);
    }, 60_000);

    it('fails the build when they are hidden', async () => {
      await expect(measureStaticClosure(fixture, undefined, { hidden })).rejects.toThrow(
        /@mermaid-js\/layout-elk/
      );
    }, 60_000);
  });
});
