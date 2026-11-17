/**
 * #822 (D446, D559): a diagram type loads only the shared shape files it draws from. The CDN
 * build splits by file (`@mermaid-js/shared` README), so a type that imported one shape from
 * `shapes/extended` would load all of them.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Bundle } from './build.ts';
import { chunkOf, closureSize, measureStaticClosure, readSizeBudget } from './size-budget.ts';

let bundle: Bundle;

beforeAll(async () => {
  bundle = (await measureStaticClosure(readSizeBudget().core.entry)).bundle;
}, 60_000);

/** The shared shape files in the static closure of the type's lazily imported chunk. */
function shapeFiles(type: string): string[] {
  const chunk = chunkOf(bundle, `packages/diagram-${type}/src/index.ts`);
  if (chunk === undefined) throw new Error(`no lazily imported chunk for ${type}`);
  return closureSize(bundle, [chunk])
    .files.flatMap((f) => bundle.graph[f.path]!.inputs)
    .filter((p) => p.startsWith('packages/shared/src/shapes/'))
    .map((p) => p.slice('packages/shared/src/shapes/'.length))
    .sort();
}

describe('shared shape chunks (#822)', () => {
  it("keeps every shape file out of core's static closure", () => {
    const inputs = bundle.staticClosure.flatMap((f) => bundle.graph[f]!.inputs);
    expect(inputs.length).toBeGreaterThan(0);
    expect(inputs.filter((p) => p.startsWith('packages/shared/src/shapes/'))).toEqual([]);
  });

  it('loads every shape file for flowchart, which can name any shape', () => {
    expect(shapeFiles('flowchart')).toEqual(['basic.ts', 'extended.ts', 'kit.ts']);
  });

  it('loads no extended shape for agentflow and block, which draw only basic ones', () => {
    expect(shapeFiles('agentflow')).toEqual(['basic.ts', 'kit.ts']);
    expect(shapeFiles('block')).toEqual(['basic.ts', 'kit.ts']);
  });

  it("loads only the kit for c4, which draws none of flowchart's shapes", () => {
    expect(shapeFiles('c4')).toEqual(['kit.ts']);
  });
});
