import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ROOT } from './diagrams.ts';
import {
  checkConfigs,
  parseTypecheckScript,
  planTypecheck,
  workspaceTypecheckScripts,
} from './typecheck.ts';

const scripts = (
  JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  }
).scripts;

const BASE = {
  compilerOptions: {
    target: 'ES2022',
    // The smallest default library keeps each program quick to build.
    lib: ['ES5'],
    types: [],
    module: 'nodenext',
    moduleResolution: 'nodenext',
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  },
};

const temp = mkdtempSync(join(tmpdir(), 'typecheck-spec-'));
afterAll(() => rmSync(temp, { recursive: true, force: true }));

let fixtureCount = 0;
/** A temporary workspace: `files` maps a relative path to its text (objects are JSON). */
function fixture(files: Record<string, string | object>): string {
  const root = join(temp, String(fixtureCount++));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), typeof text === 'string' ? text : JSON.stringify(text));
  }
  return root;
}

function pkg(name: string, src: Record<string, string>): Record<string, string | object> {
  const files: Record<string, string | object> = {
    [`packages/${name}/package.json`]: { name, type: 'module' },
    [`packages/${name}/tsconfig.json`]: { extends: '../../tsconfig.json', include: ['src'] },
  };
  for (const [file, text] of Object.entries(src)) files[`packages/${name}/src/${file}`] = text;
  return files;
}

const configsOf = (root: string, ...names: string[]) =>
  names.map((name) => join(root, 'packages', name, 'tsconfig.json'));

describe('the typecheck script parser', () => {
  it('reads the tsconfig of each `tsc -p` step', () => {
    expect(parseTypecheckScript('tsc -p tsconfig.json')).toEqual(['tsconfig.json']);
    expect(parseTypecheckScript('tsc -p tsconfig.json && tsc -p ../../e2e/tsconfig.json')).toEqual([
      'tsconfig.json',
      '../../e2e/tsconfig.json',
    ]);
  });

  it('gives up on anything else, so the script runs as written', () => {
    expect(parseTypecheckScript('tsc -p tsconfig.json --strict false')).toBeUndefined();
    expect(parseTypecheckScript('vue-tsc -p tsconfig.json')).toBeUndefined();
    expect(parseTypecheckScript('tsc -p a.json; rm -rf x')).toBeUndefined();
  });
});

// Each case builds real TypeScript programs: seconds each on a busy machine.
describe('the typecheck plan', { timeout: 60_000 }, () => {
  it('covers every workspace package with a typecheck script', () => {
    const plan = planTypecheck(ROOT, []);
    const planned = new Set([
      ...plan.groups.flatMap((g) => g.configs),
      ...plan.scripts.map((s) => s.dir),
    ]);
    const found = workspaceTypecheckScripts(ROOT);
    expect(found.length).toBeGreaterThan(40);
    for (const { dir, script } of found) {
      const configs = parseTypecheckScript(script);
      if (configs === undefined) expect(planned, dir).toContain(dir);
      else for (const c of configs) expect(planned, `${dir}: ${c}`).toContain(join(dir, c));
    }
  });

  it('groups configs whose compiler options are identical, and only those', () => {
    const root = fixture({
      'tsconfig.json': BASE,
      // No workspace packages: only the configs passed in.
      'pnpm-workspace.yaml': "packages:\n  - 'none/*'\n",
      ...pkg('a', { 'a.ts': 'export const a = 1;\n' }),
      ...pkg('b', { 'b.ts': 'export const b = 1;\n' }),
      'packages/c/package.json': { name: 'c' },
      'packages/c/tsconfig.json': {
        extends: '../../tsconfig.json',
        compilerOptions: { lib: ['ES2022', 'DOM'] },
        include: ['src'],
      },
      'packages/c/src/c.ts': 'export const c = 1;\n',
    });
    const plan = planTypecheck(root, configsOf(root, 'a', 'b', 'c'));
    expect(plan.groups.map((g) => g.configs.length).sort()).toEqual([1, 2]);
  });

  it('is the workspace typecheck that `pnpm typecheck` runs', () => {
    expect(scripts.typecheck).toBe(
      'tsx tools/workspace/typecheck-cli.ts tools/tsconfig.json e2e/dom/tsconfig.json'
    );
  });
});

describe('checking a group of configs', { timeout: 60_000 }, () => {
  it('reports a type error in any member, as `tsc -p` would', () => {
    const root = fixture({
      'tsconfig.json': BASE,
      ...pkg('a', { 'a.ts': 'export const a: number = 1;\n' }),
      ...pkg('b', { 'b.ts': "export const b: number = 'not a number';\n" }),
    });
    const result = checkConfigs(configsOf(root, 'a', 'b'));
    expect(result.shared).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/packages\/b\/src\/b\.ts.*TS2322/);
  });

  it('reports an error in a dependency once, not once per member', () => {
    const root = fixture({
      'tsconfig.json': BASE,
      ...pkg('core', { 'index.ts': "export const core: number = 'oops';\n" }),
      ...pkg('a', { 'a.ts': "export { core } from '../../core/src/index.ts';\n" }),
      ...pkg('b', { 'b.ts': "export { core } from '../../core/src/index.ts';\n" }),
    });
    const base = {
      ...BASE,
      compilerOptions: { ...BASE.compilerOptions, allowImportingTsExtensions: true },
    };
    writeFileSync(join(root, 'tsconfig.json'), JSON.stringify(base));
    const result = checkConfigs(configsOf(root, 'a', 'b'));
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/packages\/core\/src\/index\.ts.*TS2322/);
  });

  it('checks members apart when one declares globals another could lean on', () => {
    // b uses a global only a declares: `tsc -p` on b fails, so the group must fail too.
    const root = fixture({
      'tsconfig.json': BASE,
      ...pkg('a', {
        'a.ts': 'declare global {\n  var leaked: number;\n}\nexport const a = 1;\n',
      }),
      ...pkg('b', { 'b.ts': 'export const b: number = leaked;\n' }),
    });
    const result = checkConfigs(configsOf(root, 'a', 'b'));
    expect(result.shared).toBe(false);
    expect(result.errors.join('\n')).toMatch(/packages\/b\/src\/b\.ts.*TS2304.*leaked/);
  });

  it('hands a group back to be split, when asked, instead of checking it member by member', () => {
    const root = fixture({
      'tsconfig.json': BASE,
      ...pkg('a', { 'a.ts': 'declare global {\n  var leaked: number;\n}\nexport const a = 1;\n' }),
      ...pkg('b', { 'b.ts': 'export const b: number = leaked;\n' }),
    });
    const result = checkConfigs(configsOf(root, 'a', 'b'), { split: true });
    expect(result).toMatchObject({ shared: false, split: true, errors: [] });
    // Split, each member alone still fails as `tsc -p` does.
    expect(checkConfigs(configsOf(root, 'b')).errors.join('\n')).toMatch(/TS2304.*leaked/);
  });

  it('checks members apart when a file adds a lib for the whole program', () => {
    const root = fixture({
      'tsconfig.json': BASE,
      ...pkg('a', { 'a.ts': '/// <reference lib="dom" />\nexport const a = 1;\n' }),
      ...pkg('b', { 'b.ts': 'export const b = document.title;\n' }),
    });
    const result = checkConfigs(configsOf(root, 'a', 'b'));
    expect(result.shared).toBe(false);
    expect(result.errors.join('\n')).toMatch(/packages\/b\/src\/b\.ts.*TS2584|document/);
  });

  it('checks members apart when a script file declares ambient names', () => {
    const root = fixture({
      'tsconfig.json': BASE,
      ...pkg('a', { 'ambient.d.ts': 'declare const ambient: number;\n' }),
      ...pkg('b', { 'b.ts': 'export const b: number = ambient;\n' }),
    });
    const result = checkConfigs(configsOf(root, 'a', 'b'));
    expect(result.shared).toBe(false);
    expect(result.errors.join('\n')).toMatch(/packages\/b\/src\/b\.ts.*TS2304.*ambient/);
  });

  it('shares a program when the only globals come from the `types` every member names', () => {
    const typed = { ...BASE, compilerOptions: { ...BASE.compilerOptions, types: ['fake'] } };
    const root = fixture({
      'tsconfig.json': typed,
      'node_modules/@types/fake/package.json': { name: '@types/fake', types: 'index.d.ts' },
      'node_modules/@types/fake/index.d.ts': 'declare const fakeGlobal: number;\n',
      ...pkg('a', { 'a.ts': 'export const a: number = fakeGlobal;\n' }),
      ...pkg('b', { 'b.ts': 'export const b: string = fakeGlobal;\n' }),
    });
    const result = checkConfigs(configsOf(root, 'a', 'b'));
    expect(result.shared).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/packages\/b\/src\/b\.ts.*TS2322/);
  });

  it('reports a broken tsconfig', () => {
    const root = fixture({
      'tsconfig.json': BASE,
      'packages/a/tsconfig.json': '{ "extends": "./missing.json", "include": ["src"] }',
      'packages/a/src/a.ts': 'export const a = 1;\n',
    });
    expect(checkConfigs(configsOf(root, 'a')).errors.join('\n')).toMatch(/missing\.json/);
  });
});
