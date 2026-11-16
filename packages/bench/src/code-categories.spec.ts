/**
 * The size report's categories (#814): the rules are data in `code-categories.ts`, and every
 * counted file of this checkout matches one, so a new folder is classified when it is added.
 */
import { describe, expect, it } from 'vitest';
import { CATEGORIES, categoryOf } from './code-categories.ts';
import { listSourceFiles } from './code-lines.ts';
import { REPO_ROOT as ROOT } from './code-size.ts';

describe('code categories', () => {
  it('puts every counted file under packages/*/src in a category', () => {
    const files = listSourceFiles(ROOT);
    expect(files.length).toBeGreaterThan(1000);
    const unmatched = files.filter((f) => categoryOf(f.path) === undefined).map((f) => f.path);
    expect(unmatched).toEqual([]);
  });

  it('matches no file that is not under a package src folder', () => {
    expect(categoryOf('packages/core/package.json')).toBeUndefined();
    expect(categoryOf('tools/gen-config/src/index.ts')).toBeUndefined();
  });

  it.each([
    ['packages/diagram-pie/src/parser/lexer.ts', 'parsing'],
    ['packages/core/src/parser-kit/cursor.ts', 'parsing'],
    ['packages/core/src/preprocess/yaml.ts', 'parsing'],
    ['packages/diagram-gantt/src/model.ts', 'parsing'],
    ['packages/diagram-pie/src/render/render.ts', 'render'],
    ['packages/diagram-pie/src/layout/layout.ts', 'render'],
    ['packages/core/src/svg/writer.ts', 'render'],
    ['packages/core/src/text/label.ts', 'render'],
    ['packages/diagram-pie/src/facet/completion.ts', 'editor'],
    ['packages/diagram-pie/src/language.ts', 'editor'],
    ['packages/language-service/src/service.ts', 'editor'],
    ['packages/diagram-pie/src/layout/invariants.ts', 'test'],
    ['packages/diagram-pie/src/layout/fixtures.ts', 'test'],
    ['packages/diagram-pie/src/render/harness.ts', 'test'],
    ['packages/diagram-block/src/test-context.ts', 'test'],
    ['packages/diagram-pie/src/testing.ts', 'test'],
    ['packages/diagram-state/src/testing.fixtures.ts', 'test'],
    ['packages/diagram-pie/src/v12-specs/pie.ts', 'test'],
    ['packages/core/src/svg/testing/index.ts', 'test'],
    ['packages/core/src/layout/swimlane/__tests__/graphs.ts', 'test'],
    ['packages/core/src/layout/layered/grid.fixtures.ts', 'test'],
    ['packages/diagram-pie/src/generated/config.ts', 'generated'],
    ['packages/language-service/src/generated/config-schema.gen.ts', 'generated'],
    ['packages/core/src/layout/swimlane/adapter.ts', 'swimlane'],
    ['packages/core/src/layout/layered/index.ts', 'shared-layout'],
    ['packages/core/src/ascii/repair.ts', 'ascii'],
    ['packages/diagram-er/src/ascii.ts', 'ascii'],
    ['packages/diagram-er/src/ascii/draw.ts', 'ascii'],
    ['packages/core/src/theme/theme.ts', 'theme-config'],
    ['packages/diagram-pie/src/theme/table.ts', 'theme-config'],
    ['packages/diagram-pie/src/config.ts', 'theme-config'],
    ['packages/plugin-math/src/engine.ts', 'plugins'],
    ['packages/layout-elk/src/adapter.ts', 'plugins'],
    ['packages/mermaid/src/dom.ts', 'plugins'],
    ['packages/mermaid/src/api.ts', 'api'],
    ['packages/core/src/pipeline/draw.ts', 'api'],
    ['packages/diagram-pie/src/plugin.ts', 'api'],
    ['packages/diagram-pie/src/index.ts', 'api'],
    ['packages/shared/src/parser/flow-lexer.ts', 'parsing'],
    ['packages/shared/src/parser/flow-facet.ts', 'editor'],
    ['packages/shared/src/parser/flow-hover.ts', 'editor'],
    ['packages/shared/src/svg/route.ts', 'render'],
    ['packages/shared/src/shapes/kit.ts', 'render'],
    ['packages/shared/src/layout/bounds.ts', 'shared-layout'],
    ['packages/shared/src/config/readers.ts', 'theme-config'],
    ['packages/bench/src/build.ts', 'tooling'],
    ['packages/conformance/src/pie/oracle.ts', 'tooling'],
  ])('puts %s in %s', (path, category) => {
    expect(categoryOf(path)).toBe(category);
  });

  it('names each category once, with a label', () => {
    const ids = CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CATEGORIES) expect(c.label).not.toBe('');
  });
});
