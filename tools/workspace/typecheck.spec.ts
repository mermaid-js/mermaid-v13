import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ROOT } from './diagrams.ts';
import type { Task } from './parallel.ts';
import {
  checkConfigs,
  parseTypecheckScript,
  planTypecheck,
  SPLIT_EXIT,
  splitTasks,
  TSC,
  typecheckTasks,
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

// The real path: on macOS the temp directory is behind a symlink, which would make one file
// look like two to TypeScript.
const temp = realpathSync(mkdtempSync(join(tmpdir(), 'typecheck-spec-')));
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

  // Review of #892: the shared program resolves `types` from the first member's directory, so a
  // member whose own `types` resolve to other files (here an `Error` augmentation) must not share.
  it('checks members apart when their `types` resolve to different files', () => {
    const typed = { ...BASE, compilerOptions: { ...BASE.compilerOptions, types: ['fake'] } };
    const fake = (text: string) => ({
      package: { name: '@types/fake', types: 'index.d.ts' },
      text,
    });
    const [forA, forB] = [
      fake('declare const fakeA: number;\n'),
      fake('interface Error {\n  code: string;\n}\n'),
    ];
    const root = fixture({
      'tsconfig.json': {
        ...typed,
        compilerOptions: { ...typed.compilerOptions, allowImportingTsExtensions: true },
      },
      'packages/a/node_modules/@types/fake/package.json': forA.package,
      'packages/a/node_modules/@types/fake/index.d.ts': forA.text,
      'packages/b/node_modules/@types/fake/package.json': forB.package,
      'packages/b/node_modules/@types/fake/index.d.ts': forB.text,
      ...pkg('a', {
        'x.ts':
          '/// <reference path="../node_modules/@types/fake/index.d.ts" />\nexport const x = 1;\n',
      }),
      ...pkg('b', {
        'b.ts':
          "import { x } from '../../a/src/x.ts';\nexport const e: Error = { name: 'n', message: 'm' };\nexport const y = x;\n",
      }),
    });
    expect(checkConfigs(configsOf(root, 'b')).errors.join('\n')).toMatch(/b\.ts.*TS2741/);
    const result = checkConfigs(configsOf(root, 'a', 'b'));
    expect(result.shared).toBe(false);
    expect(result.errors.join('\n')).toMatch(/packages\/b\/src\/b\.ts.*TS2741/);
    expect(checkConfigs(configsOf(root, 'b', 'a')).errors.join('\n')).toMatch(/b\.ts.*TS2741/);
  });

  it('checks members apart when one has a global-declaring file the shared program lacks', () => {
    // Same `types` names, no reference between the members: only the resolution differs.
    const typed = { ...BASE, compilerOptions: { ...BASE.compilerOptions, types: ['fake'] } };
    const root = fixture({
      'tsconfig.json': typed,
      'packages/a/node_modules/@types/fake/package.json': {
        name: '@types/fake',
        types: 'index.d.ts',
      },
      'packages/a/node_modules/@types/fake/index.d.ts': 'declare const fakeA: number;\n',
      'packages/b/node_modules/@types/fake/package.json': {
        name: '@types/fake',
        types: 'index.d.ts',
      },
      'packages/b/node_modules/@types/fake/index.d.ts': 'declare const fakeB: number;\n',
      ...pkg('a', { 'a.ts': 'export const a: number = fakeA;\n' }),
      ...pkg('b', { 'b.ts': 'export const b: number = fakeA;\n' }),
    });
    const result = checkConfigs(configsOf(root, 'a', 'b'));
    expect(result.shared).toBe(false);
    expect(result.errors.join('\n')).toMatch(/packages\/b\/src\/b\.ts.*TS\d+.*fakeA/);
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

describe('the typecheck tasks', () => {
  const tools = { node: ['node'], worker: 'worker.ts', pretty: false };
  const plan = {
    groups: [
      { configs: ['/r/a/tsconfig.json', '/r/b/tsconfig.json'], size: 2 },
      { configs: ['/r/c/tsconfig.json'], size: 1 },
    ],
    scripts: [{ dir: '/r/d', name: 'd', script: 'vue-tsc' }],
  };
  const tasks = typecheckTasks(plan, tools);
  const result = (task: Task, code: number) => ({
    task,
    ok: code === 0,
    code,
    output: 'x',
    seconds: 1,
  });

  it('runs a group in the worker, a lone config as a literal `tsc -p`, a script as written', () => {
    expect(tasks.map((t) => [t.command, ...t.args].join(' '))).toEqual([
      'node worker.ts --split /r/a/tsconfig.json /r/b/tsconfig.json',
      `node ${TSC} -p /r/c/tsconfig.json`,
      'pnpm --dir /r/d run typecheck',
    ]);
  });

  it('splits only a group worker that asked for it, into `tsc -p` per member', () => {
    expect(splitTasks(result(tasks[0]!, SPLIT_EXIT), tools)?.map((t) => t.args)).toEqual([
      [TSC, '-p', '/r/a/tsconfig.json'],
      [TSC, '-p', '/r/b/tsconfig.json'],
    ]);
    expect(splitTasks(result(tasks[0]!, 1), tools)).toBeUndefined();
    // tsc exits 3 for an invalid project, and a script may exit 3 too: those are failures.
    expect(splitTasks(result(tasks[1]!, SPLIT_EXIT), tools)).toBeUndefined();
    expect(splitTasks(result(tasks[2]!, SPLIT_EXIT), tools)).toBeUndefined();
  });
});
