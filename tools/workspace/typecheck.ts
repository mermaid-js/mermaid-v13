/**
 * `pnpm typecheck`: every tsconfig that a workspace package's `typecheck` script names, checked
 * as `tsc -p` checks it, with the work shared where sharing should not change a result.
 *
 * Workspace packages resolve each other to their TypeScript sources (the `mermaid-source`
 * condition), so `tsc -p` in each diagram package type-checks core and shared again: about 35
 * programs that all contain core. Configs whose compiler options are identical are checked as
 * one program instead, so each file is checked once. That gives the same diagnostics as
 * separate programs as long as every file sees the same global scope and resolves the same
 * way in both. Globals come from script (non-module) files, `declare global`,
 * `declare module 'x'` augmentations, UMD `export as namespace`, `/// <reference lib>` and the
 * `types` packages, so configs share a program only when their `types` resolve to the same
 * files and each member's own program has exactly the shared program's global-declaring files
 * (vitest's and chai's globals are in all of them). Otherwise every member is checked alone
 * by `tsc -p`, exactly as before. A config with emit, references or incremental output is
 * never shared (it runs as `tsc -p`), and a `typecheck` script that is not plain `tsc -p`
 * steps runs as written.
 *
 * One difference remains: errors that depend on the order in which the checker meets
 * declarations (circularity such as TS7022 or TS2502, "excessively deep" instantiation) were
 * met from about 35 starting points, one per package, and are now met from one. A shared
 * program reports them where it first reaches them; it could in principle miss one that only a
 * particular starting point shows.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { load } from 'js-yaml';
import ts from 'typescript';
import type { Task, TaskResult } from './parallel.ts';

/** A workspace package's `typecheck` script. */
export interface TypecheckScript {
  /** The package directory, absolute. */
  readonly dir: string;
  readonly name: string;
  readonly script: string;
}

/** Configs checked together (one program when nothing declares globals). */
export interface TypecheckGroup {
  /** Absolute tsconfig paths. */
  readonly configs: readonly string[];
  /** Root files over all members: a size estimate, to start the largest groups first. */
  readonly size: number;
}

export interface TypecheckPlan {
  readonly groups: readonly TypecheckGroup[];
  /** Packages whose `typecheck` script is not plain `tsc -p` steps; they run as written. */
  readonly scripts: readonly TypecheckScript[];
}

export interface CheckResult {
  /** True when the configs were checked as one program. */
  readonly shared: boolean;
  /** True when `split` was asked for and the configs need checking one at a time: nothing ran. */
  readonly split?: boolean;
  readonly diagnostics: readonly ts.Diagnostic[];
  /** The error diagnostics, formatted as `tsc --pretty false` prints them. */
  readonly errors: readonly string[];
}

/** The exit code of a `--split` worker whose group must be checked one member at a time. */
export const SPLIT_EXIT = 3;

const STEP = /^tsc -p (\S+)$/;

/** The tsconfig of each `tsc -p <config>` step, or undefined when the script is anything else. */
export function parseTypecheckScript(script: string): string[] | undefined {
  const configs: string[] = [];
  for (const step of script.split('&&').map((s) => s.trim())) {
    const config = STEP.exec(step)?.[1];
    if (config === undefined || /[;|&<>`$]/.test(config)) return undefined;
    configs.push(config);
  }
  return configs;
}

/** Every workspace package (from `pnpm-workspace.yaml`) that has a `typecheck` script. */
export function workspaceTypecheckScripts(root: string): TypecheckScript[] {
  const { packages } = load(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')) as {
    packages: string[];
  };
  return packages.flatMap((glob) => {
    if (!/^[\w./-]+\/\*$/.test(glob))
      throw new Error(`pnpm-workspace.yaml: \`${glob}\` is not of the form \`<dir>/*\``);
    const parent = join(root, glob.slice(0, -2));
    if (!existsSync(parent)) return [];
    return readdirSync(parent)
      .sort()
      .map((name) => join(parent, name))
      .filter((dir) => existsSync(join(dir, 'package.json')))
      .flatMap((dir) => {
        const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
          name: string;
          scripts?: Record<string, string>;
        };
        const script = manifest.scripts?.typecheck;
        return script === undefined ? [] : [{ dir, name: manifest.name, script }];
      });
  });
}

const formatHost: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (f) => f,
  getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
  getNewLine: () => '\n',
};

function parseConfig(config: string): ts.ParsedCommandLine {
  const unrecoverable: ts.Diagnostic[] = [];
  const parsed = ts.getParsedCommandLineOfConfigFile(
    config,
    {},
    { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d) => unrecoverable.push(d) }
  );
  return parsed ?? { options: {}, fileNames: [], errors: unrecoverable };
}

/** Sorted-key JSON of the options, without the fields that only name the config file. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([k, v]) => v !== undefined && k !== 'configFile' && k !== 'configFilePath')
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** The key configs are grouped by, or undefined when the config must be checked alone. */
function shareKey(parsed: ts.ParsedCommandLine): string | undefined {
  const { options } = parsed;
  const alone =
    parsed.errors.length > 0 ||
    (parsed.projectReferences?.length ?? 0) > 0 ||
    options.noEmit !== true ||
    options.incremental === true ||
    options.composite === true;
  return alone ? undefined : stableJson(options);
}

/**
 * The groups and scripts `pnpm typecheck` runs: every config the packages' `typecheck` scripts
 * name, plus `extraConfigs` (relative to `root`).
 */
export function planTypecheck(root: string, extraConfigs: readonly string[]): TypecheckPlan {
  const scripts: TypecheckScript[] = [];
  const configs = extraConfigs.map((c) => resolve(root, c));
  for (const entry of workspaceTypecheckScripts(root)) {
    const named = parseTypecheckScript(entry.script);
    if (named === undefined) scripts.push(entry);
    else configs.push(...named.map((c) => resolve(entry.dir, c)));
  }
  const byKey = new Map<string, { configs: string[]; size: number }>();
  let alone = 0;
  for (const config of new Set(configs)) {
    const parsed = parseConfig(config);
    const key = shareKey(parsed) ?? `alone:${alone++}`;
    const group = byKey.get(key) ?? { configs: [], size: 0 };
    group.configs.push(config);
    group.size += parsed.fileNames.length;
    byKey.set(key, group);
  }
  return { groups: [...byKey.values()].sort((a, b) => b.size - a.size), scripts };
}

const augments = (statement: ts.Statement): boolean =>
  ts.isNamespaceExportDeclaration(statement) ||
  (ts.isModuleDeclaration(statement) &&
    (ts.isStringLiteral(statement.name) ||
      (statement.flags & ts.NodeFlags.GlobalAugmentation) !== 0));

/**
 * Files of `program` that can change what another file sees: non-module files, global or
 * module augmentations, UMD globals and lib references. Default library files are the same
 * for every program with the same options and do not count.
 */
export function globalDeclarers(program: ts.Program): string[] {
  return program
    .getSourceFiles()
    .filter(
      (sf) =>
        !program.isSourceFileDefaultLibrary(sf) &&
        !sf.fileName.endsWith('.json') &&
        (!ts.isExternalModule(sf) ||
          sf.libReferenceDirectives.length > 0 ||
          sf.statements.some(augments))
    )
    .map((sf) => sf.fileName);
}

function errorsOf(diagnostics: readonly ts.Diagnostic[]): string[] {
  return diagnostics
    .filter((d) => d.category === ts.DiagnosticCategory.Error)
    .map((d) => ts.formatDiagnostic(d, formatHost).trimEnd());
}

/** A compiler host that parses each file once for all the programs built with it. */
function cachingHost(options: ts.CompilerOptions): ts.CompilerHost {
  const host = ts.createCompilerHost(options);
  const parse = host.getSourceFile.bind(host);
  const parsed = new Map<string, ts.SourceFile | undefined>();
  host.getSourceFile = (fileName, language, onError, shouldCreate) => {
    const format = typeof language === 'object' ? language.impliedNodeFormat : undefined;
    const key = `${fileName}\0${String(format)}`;
    if (!parsed.has(key)) parsed.set(key, parse(fileName, language, onError, shouldCreate));
    return parsed.get(key);
  };
  return host;
}

const programOf = (parsed: ts.ParsedCommandLine, host?: ts.CompilerHost): ts.Program =>
  ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    configFileParsingDiagnostics: parsed.errors,
    host,
  });

/** What `tsc -p` reports for one config (it has `noEmit`, or it is checked alone anyway). */
const checkOne =
  (host?: ts.CompilerHost) =>
  (parsed: ts.ParsedCommandLine): ts.Diagnostic[] => [
    ...parsed.errors,
    ...ts.getPreEmitDiagnostics(programOf(parsed, host)),
  ];

/**
 * The `types` packages a config loads and the files they resolve to. `types` names, and
 * `typeRoots` when it is not set, resolve from the config's own directory, which `stableJson`
 * leaves out of the comparison: configs share a program only when this is the same for all.
 */
function automaticTypes(options: ts.CompilerOptions, host: ts.CompilerHost): string {
  const containing = join(dirname(options.configFilePath as string), '__inferred_types__.ts');
  return ts
    .getAutomaticTypeDirectiveNames(options, host)
    .map((name) => {
      const resolved = ts.resolveTypeReferenceDirective(name, containing, options, host);
      return `${name}=${resolved.resolvedTypeReferenceDirective?.resolvedFileName ?? '(unresolved)'}`;
    })
    .join('\n');
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && new Set([...a, ...b]).size === a.length;

/**
 * Type-checks the configs, as one program when that should not change the result: the members'
 * `types` resolve to the same files, and every member's own program has exactly the shared
 * program's global-declaring files, so each file sees the same global scope in both and
 * resolves its imports the same way. Otherwise each member is checked on its own (or, with
 * `split`, nothing is checked and the caller runs them).
 */
export function checkConfigs(
  configs: readonly string[],
  { split = false }: { readonly split?: boolean } = {}
): CheckResult {
  const parsed = configs.map(parseConfig);
  const keys = new Set(parsed.map(shareKey));
  const done = (shared: boolean, diagnostics: ts.Diagnostic[]): CheckResult => ({
    shared,
    diagnostics,
    errors: errorsOf(diagnostics),
  });
  if (parsed.length === 1 || keys.size !== 1 || keys.has(undefined))
    return done(parsed.length === 1, parsed.flatMap(checkOne()));

  const options = parsed[0]!.options;
  const host = cachingHost(options);
  const apart = () =>
    split
      ? { shared: false, split: true, diagnostics: [], errors: [] }
      : done(false, parsed.flatMap(checkOne(host)));
  const types = new Set(parsed.map((p) => automaticTypes(p.options, host)));
  if (types.size !== 1) return apart();

  const program = ts.createProgram({
    rootNames: [...new Set(parsed.flatMap((p) => p.fileNames))],
    options,
    host,
  });
  // Building the members' programs only resolves imports: every file is parsed already.
  const declarers = globalDeclarers(program);
  const leaks = parsed.some((p) => !sameSet(globalDeclarers(programOf(p, host)), declarers));
  if (leaks) return apart();
  return done(true, [...ts.getPreEmitDiagnostics(program)]);
}

/** Diagnostics as `tsc` prints them, with colour and context when `pretty`. */
export function formatDiagnostics(diagnostics: readonly ts.Diagnostic[], pretty: boolean): string {
  return pretty
    ? ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost)
    : ts.formatDiagnostics(diagnostics, formatHost);
}

/** The `tsc` the workspace's packages run (the root `typescript`). */
export const TSC = createRequire(import.meta.url).resolve('typescript/bin/tsc');

export interface TypecheckTools {
  /** `node` and its flags, to run the worker (tsx's loader included). */
  readonly node: readonly string[];
  /** `typecheck-worker.ts`. */
  readonly worker: string;
  readonly pretty: boolean;
}

const SPLIT = '--split';

/** A literal `tsc -p <config>`, as the package's own `typecheck` script ran it. */
function tscTask(config: string, tools: TypecheckTools): Task {
  return {
    label: config,
    command: tools.node[0]!,
    args: [TSC, '-p', config, ...(tools.pretty ? ['--pretty'] : [])],
    nice: true,
  };
}

/**
 * The tasks for a plan: a group of configs runs in the worker (`--split`: it hands the group
 * back when its members must run alone), a lone config runs as `tsc -p`, and a script runs as
 * written.
 */
export function typecheckTasks(plan: TypecheckPlan, tools: TypecheckTools): Task[] {
  return [
    ...plan.groups.map(
      (group): Task =>
        group.configs.length === 1
          ? tscTask(group.configs[0]!, tools)
          : {
              label: `${group.configs[0]} and ${group.configs.length - 1} more with the same options`,
              command: tools.node[0]!,
              args: [
                ...tools.node.slice(1),
                tools.worker,
                ...(tools.pretty ? ['--pretty'] : []),
                SPLIT,
                ...group.configs,
              ],
              nice: true,
            }
    ),
    ...plan.scripts.map((s) => ({
      label: `${s.dir}: ${s.script}`,
      command: 'pnpm',
      args: ['--dir', s.dir, 'run', 'typecheck'],
      nice: true,
    })),
  ];
}

/**
 * The members of a group the worker handed back (exit {@link SPLIT_EXIT} from a `--split`
 * worker), each as `tsc -p`; undefined for any other result, including exit 3 from `tsc`
 * itself or from a script, which are failures.
 */
export function splitTasks(result: TaskResult, tools: TypecheckTools): Task[] | undefined {
  const { args } = result.task;
  const at = args.indexOf(SPLIT);
  if (result.code !== SPLIT_EXIT || at === -1 || !args.includes(tools.worker)) return undefined;
  return args.slice(at + 1).map((config) => tscTask(config, tools));
}
