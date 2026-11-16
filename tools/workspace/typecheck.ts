/**
 * `pnpm typecheck`: every tsconfig that a workspace package's `typecheck` script names, checked
 * as `tsc -p` checks it, with the work shared where sharing cannot change a result.
 *
 * Workspace packages resolve each other to their TypeScript sources (the `mermaid-source`
 * condition), so `tsc -p` in each diagram package type-checks core and shared again: about 35
 * programs that all contain core. Configs whose compiler options are identical are checked as
 * one program instead, so each file is checked once. That gives the same diagnostics as
 * separate programs as long as no file can see what another member brought in, which only
 * global declarations allow: a script (non-module) file, `declare global`, a
 * `declare module 'x'` augmentation, a UMD `export as namespace`, or a `/// <reference lib>`.
 * When the shared program has such a file that is not in every member's own program (vitest's
 * and chai's globals and `types` packages are in all of them), every member is checked on its
 * own, exactly as before. A config with emit, references or incremental output
 * is never shared, and a `typecheck` script that is not plain `tsc -p` steps runs as written.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';
import ts from 'typescript';

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
 * Type-checks the configs, as one program when that cannot change the result: when every file
 * of the shared program that declares globals is also in every member's own program, each
 * file sees the same global scope in both, and resolves its imports the same way.
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
  const program = ts.createProgram({
    rootNames: [...new Set(parsed.flatMap((p) => p.fileNames))],
    options,
    host,
  });
  // Building the members' programs only resolves imports: every file is parsed already.
  const members = parsed.map(
    (p) =>
      new Set(
        programOf(p, host)
          .getSourceFiles()
          .map((sf) => sf.fileName)
      )
  );
  const leaks = globalDeclarers(program).some((file) => members.some((m) => !m.has(file)));
  if (leaks && split) return { shared: false, split: true, diagnostics: [], errors: [] };
  if (leaks) return done(false, parsed.flatMap(checkOne(host)));
  return done(true, [...ts.getPreEmitDiagnostics(program)]);
}

/** Diagnostics as `tsc` prints them, with colour and context when `pretty`. */
export function formatDiagnostics(diagnostics: readonly ts.Diagnostic[], pretty: boolean): string {
  return pretty
    ? ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost)
    : ts.formatDiagnostics(diagnostics, formatHost);
}
