import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { beforeAll, describe, expect, it } from 'vitest';
import { BRAND_TYPES } from './index.ts';

// Each architecture lint rule is proven by linting a fixture as if it lived at a given
// path in the workspace, through the real root eslint.config.js.
const root = join(import.meta.dirname, '..', '..');
const fixture = (name: string) => readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8');

let eslint: ESLint;
beforeAll(() => {
  // The fixtures are linted at paths no tsconfig contains, so type-aware rules are off, and
  // they are snippets, not modules with a typed API.
  eslint = new ESLint({
    cwd: root,
    ignore: false,
    overrideConfig: [
      tseslint.configs.disableTypeChecked,
      { rules: { '@typescript-eslint/explicit-module-boundary-types': 'off' } },
    ],
  });
});

async function ruleIds(name: string, asFile: string): Promise<string[]> {
  const [result] = await eslint.lintText(fixture(name), { filePath: join(root, asFile) });
  return [...new Set(result?.messages.map((m) => m.ruleId ?? `fatal: ${m.message}`))].sort();
}

const CORE = 'packages/core/src/svg/fixture.ts';
const DIAGRAM = 'packages/diagram-flowchart/src/fixture.ts';
const OTHER_DIAGRAM = 'packages/diagram-sequence/src/fixture.ts';
const MERMAID = 'packages/mermaid/src/fixture.ts';
const SHARED = 'packages/shared/src/svg/fixture.ts';
const CORE_ASCII = 'packages/core/src/ascii/fixture.ts';
const DIAGRAM_ASCII = 'packages/diagram-flowchart/src/ascii/fixture.ts';
const DIAGRAM_ASCII_ENTRY = 'packages/diagram-flowchart/src/ascii.ts';
const DIAGRAM_LANGUAGE_ENTRY = 'packages/diagram-flowchart/src/language.ts';
const DIAGRAM_LANGUAGE = 'packages/diagram-flowchart/src/language/fixture.ts';
const DIAGRAM_PARSER = 'packages/diagram-flowchart/src/parser/fixture.ts';
const DIAGRAM_FACET = 'packages/diagram-flowchart/src/facet/fixture.ts';
const CORE_THEME = 'packages/core/src/theme/fixture.ts';
const PLUGIN = 'packages/plugin-math/src/fixture.ts';
const LAYOUT = 'packages/layout-elk/src/fixture.ts';

describe('architecture lint rules fire', () => {
  it.each([
    ['dom-globals.ts', CORE, 'no-restricted-globals'],
    ['dom-globals.ts', DIAGRAM, 'no-restricted-globals'],
    ['global-this.ts', CORE, 'no-restricted-globals'],
    ['console.ts', CORE, 'no-console'],
    ['console.ts', DIAGRAM, 'no-console'],
    ['clock.ts', CORE, 'no-restricted-syntax'],
    ['clock.ts', DIAGRAM, 'no-restricted-syntax'],
    ['import-npm-package.ts', CORE, 'mermaid/import-boundaries'],
    ['import-npm-package.ts', DIAGRAM, 'mermaid/import-boundaries'],
    ['import-npm-package.ts', MERMAID, 'mermaid/import-boundaries'],
    ['import-core.ts', CORE, 'mermaid/import-boundaries'],
    ['import-diagram.ts', CORE, 'mermaid/import-boundaries'],
    ['import-diagram.ts', SHARED, 'mermaid/import-boundaries'],
    ['import-shared.ts', CORE, 'mermaid/import-boundaries'],
    ['import-shared.ts', MERMAID, 'mermaid/import-boundaries'],
    ['import-shared-root.ts', DIAGRAM, 'mermaid/import-boundaries'],
    ['import-npm-package.ts', SHARED, 'mermaid/import-boundaries'],
    ['dom-globals.ts', SHARED, 'no-restricted-globals'],
    ['import-diagram.ts', OTHER_DIAGRAM, 'mermaid/import-boundaries'],
    ['import-mermaid.ts', CORE, 'mermaid/import-boundaries'],
    ['import-mermaid.ts', DIAGRAM, 'mermaid/import-boundaries'],
    ['import-optional-package.ts', CORE, 'mermaid/import-boundaries'],
    ['import-optional-package.ts', DIAGRAM, 'mermaid/import-boundaries'],
    ['import-optional-package.ts', MERMAID, 'mermaid/import-boundaries'],
    ['import-escapes-package.ts', DIAGRAM, 'mermaid/import-boundaries'],
    ['import-core-ascii.ts', DIAGRAM, 'mermaid/import-boundaries'],
    ['import-core-ascii.ts', MERMAID, 'mermaid/import-boundaries'],
    ['import-ascii-relative.ts', CORE, 'mermaid/import-boundaries'],
    ['import-svg-from-ascii.ts', CORE_ASCII, 'mermaid/import-boundaries'],
    ['import-render-from-language.ts', DIAGRAM_LANGUAGE_ENTRY, 'mermaid/import-boundaries'],
    ['import-render-from-parser.ts', DIAGRAM_LANGUAGE, 'mermaid/import-boundaries'],
    ['import-render-from-parser.ts', DIAGRAM_PARSER, 'mermaid/import-boundaries'],
    ['import-render-from-parser.ts', DIAGRAM_FACET, 'mermaid/import-boundaries'],
    ['global-config.ts', CORE, 'mermaid/no-global-config'],
    ['global-config.ts', DIAGRAM, 'mermaid/no-global-config'],
    ['nested-quantifier.ts', CORE, 'mermaid/no-nested-quantifier'],
    ['nested-quantifier.ts', DIAGRAM, 'mermaid/no-nested-quantifier'],
    ['trailing-quantifier.ts', CORE, 'mermaid/no-nested-quantifier'],
    ['trailing-quantifier.ts', DIAGRAM, 'mermaid/no-nested-quantifier'],
    ['magic-char-code.ts', CORE, 'mermaid/no-magic-char-code'],
    ['magic-char-code.ts', DIAGRAM, 'mermaid/no-magic-char-code'],
    ['brand-cast.ts', DIAGRAM, 'mermaid/no-brand-cast'],
    ['brand-cast.ts', SHARED, 'mermaid/no-brand-cast'],
    ['brand-cast.ts', MERMAID, 'mermaid/no-brand-cast'],
    ['brand-cast.ts', PLUGIN, 'mermaid/no-brand-cast'],
    ['brand-cast-core.ts', CORE_THEME, 'mermaid/no-brand-cast'],
    ['module-state.ts', DIAGRAM, 'mermaid/no-module-state'],
    ['module-state.ts', PLUGIN, 'mermaid/no-module-state'],
    ['module-state.ts', LAYOUT, 'mermaid/no-module-state'],
  ])('%s in %s reports %s', async (name, asFile, ruleId) => {
    expect(await ruleIds(name, asFile)).toEqual([ruleId]);
  });

  it('reports every offending import, regex and lookup, not just the first', async () => {
    const [result] = await eslint.lintText(fixture('nested-quantifier.ts'), {
      filePath: join(root, CORE),
    });
    expect(result?.messages).toHaveLength(2);
    const [trailing] = await eslint.lintText(fixture('trailing-quantifier.ts'), {
      filePath: join(root, CORE),
    });
    expect(trailing?.messages.map((m) => m.messageId)).toEqual(Array(5).fill('trailing'));
    const [config] = await eslint.lintText(fixture('global-config.ts'), {
      filePath: join(root, CORE),
    });
    expect(config?.messages).toHaveLength(2);
    const [clock] = await eslint.lintText(fixture('clock.ts'), { filePath: join(root, CORE) });
    expect(clock?.messages).toHaveLength(3);
    const [chars] = await eslint.lintText(fixture('magic-char-code.ts'), {
      filePath: join(root, DIAGRAM),
    });
    expect(chars?.messages).toHaveLength(3);
    const [parser] = await eslint.lintText(fixture('import-render-from-parser.ts'), {
      filePath: join(root, DIAGRAM_PARSER),
    });
    expect(parser?.messages).toHaveLength(2);
    for (const file of [CORE, DIAGRAM, MERMAID]) {
      const [optional] = await eslint.lintText(fixture('import-optional-package.ts'), {
        filePath: join(root, file),
      });
      expect(optional?.messages.map((m) => m.ruleId)).toEqual(
        Array(3).fill('mermaid/import-boundaries')
      );
    }
    const [casts] = await eslint.lintText(fixture('brand-cast.ts'), {
      filePath: join(root, DIAGRAM),
    });
    expect(casts?.messages.map((m) => m.line)).toEqual([13, 14, 15, 16, 17, 18, 19]);
    const [state] = await eslint.lintText(fixture('module-state.ts'), {
      filePath: join(root, PLUGIN),
    });
    expect(state?.messages.map((m) => m.line)).toEqual([2, 3, 4]);
    // TypeScript files have `no-var` already; a JavaScript module is held to `var` too.
    const [js] = await eslint.lintText('var n = 0;\nexport const next = () => n++;\n', {
      filePath: join(root, 'packages/plugin-math/src/fixture.js'),
    });
    expect(js?.messages.map((m) => m.ruleId)).toEqual(['mermaid/no-module-state']);
    const [facet] = await eslint.lintText(fixture('import-render-from-facet.ts'), {
      filePath: join(root, DIAGRAM_FACET),
    });
    expect(facet?.messages.map((m) => m.ruleId)).toEqual(
      Array(6).fill('mermaid/import-boundaries')
    );
  });
});

describe('mermaid/no-brand-cast', () => {
  it('knows every brand type that core/src/svg/types.ts declares', () => {
    const types = readFileSync(join(root, 'packages/core/src/svg/types.ts'), 'utf8');
    const declared = [...types.matchAll(/^export type (\w+)(?:<[^=]*>)? = ([^;]+);/gm)];
    const branded = new Set<string>(['Brand']);
    // An alias holds a brand when it names `Brand<…>` or an alias found before it.
    for (const [, name = '', body = ''] of declared) {
      if ([...branded].some((b) => new RegExp(`\\b${b}\\b`).test(body))) {
        branded.add(name);
      }
    }
    expect([...BRAND_TYPES].sort()).toEqual([...branded].sort());
  });
});

describe('architecture lint rules allow the intended directions', () => {
  it.each([
    ['import-core.ts', DIAGRAM],
    ['import-core.ts', MERMAID],
    ['import-core.ts', SHARED],
    ['import-shared.ts', DIAGRAM],
    ['import-diagram.ts', MERMAID],
    ['import-relative.ts', CORE],
    ['import-relative.ts', DIAGRAM],
    ['import-relative.ts', CORE_ASCII],
    ['import-core-ascii.ts', DIAGRAM_ASCII],
    ['import-core-ascii.ts', DIAGRAM_ASCII_ENTRY],
    ['import-parser-from-language.ts', DIAGRAM_LANGUAGE_ENTRY],
    ['import-parser-from-facet.ts', DIAGRAM_FACET],
    ['import-render-from-language.ts', DIAGRAM],
    ['linear-regex.ts', CORE],
    ['named-char-code.ts', DIAGRAM],
    ['dom-in-adapter.ts', MERMAID],
    ['fixed-date.ts', CORE],
    ['fixed-date.ts', DIAGRAM],
    ['clock.ts', MERMAID],
    ['clock.ts', 'packages/core/src/svg/fixture.spec.ts'],
    ['brand-cast-core.ts', CORE],
    ['brand-cast.ts', 'packages/diagram-flowchart/src/render/render.spec.ts'],
    ['brand-cast.ts', 'packages/shared/src/testing/fixture.ts'],
    ['brand-checked.ts', DIAGRAM],
    ['module-state.ts', CORE],
    ['module-state.ts', SHARED],
    ['module-state.ts', MERMAID],
    ['module-state.ts', 'packages/plugin-math/src/index.spec.ts'],
    ['module-state.ts', 'packages/diagram-flowchart/src/v12-specs/adapter.ts'],
    ['module-state.ts', 'packages/diagram-flowchart/src/ascii/flow.fixtures.ts'],
    ['module-const.ts', DIAGRAM],
  ])('%s in %s is clean', async (name, asFile) => {
    expect(await ruleIds(name, asFile)).toEqual([]);
  });

  it('lets core tests import vitest and node builtins', async () => {
    const code =
      "import { it } from 'vitest';\nimport { join } from 'node:path';\nit(join('a'), () => {});\n";
    const [result] = await eslint.lintText(code, {
      filePath: join(root, 'packages/core/src/svg/writer.spec.ts'),
    });
    expect(result?.messages).toEqual([]);
  });

  it("lets mermaid's Node-only files, and only those, import node builtins (D85, D165)", async () => {
    const code = "import { parseArgs } from 'node:util';\nexport const p = parseArgs;\n";
    const lint = async (file: string) =>
      (await eslint.lintText(code, { filePath: join(root, file) }))[0]?.messages ?? [];
    expect(await lint('packages/mermaid/src/cli.ts')).toEqual([]);
    expect(await lint('packages/mermaid/src/node.ts')).toEqual([]);
    expect(await lint('packages/mermaid/src/node-scan.ts')).toEqual([]);
    expect((await lint(MERMAID)).map((m) => m.ruleId)).toEqual(['mermaid/import-boundaries']);
    expect((await lint('packages/core/src/cli.ts')).map((m) => m.ruleId)).toEqual([
      'mermaid/import-boundaries',
    ]);
  });
});
