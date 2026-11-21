/**
 * What the pre-push hook checks (#879): the pure part of `cli.ts`. The hook checks what a push
 * changes since it left `mermaid-v13`; CI runs the full gate (`pnpm check` and the build).
 */

/** The branch a push is compared with, on the remote whose URL is {@link TARGET_REPO}. */
export const TARGET_BRANCH = 'mermaid-v13';
const TARGET_REPO = /[/:]mermaid-js\/mermaid-v13(\.git)?\/?$/i;

/**
 * The name of the remote that points at `mermaid-js/mermaid-v13`, from `git remote -v`. It is
 * `mermaid-js` in some checkouts and `origin` in others, so only the URL identifies it.
 */
export function findRemote(remoteList: string): string | undefined {
  for (const line of remoteList.split('\n')) {
    const [name, url] = line.split(/\s+/);
    if (name && url && TARGET_REPO.test(url)) return name;
  }
  return undefined;
}

const DOCS_ROOTS = ['docs', 'v13/docs'];
const SCRIPT_FILE = /\.[cm]?[jt]sx?$/;
/** Folders whose Markdown is test data or release input, not documentation. */
const DATA_FOLDER = /(^|\/)(__snapshots__|fixtures|goldens)\//;
const DATA_ROOT = /^(packages\/[^/]+\/src|e2e|\.changeset)\//;

/**
 * True for a file that can only be documentation: Markdown, or anything under `docs/` and
 * `v13/docs/`, except script files and the Markdown that lives with code (snapshots, fixtures,
 * goldens, a package's `src`, the e2e corpus, changesets). A docs file that code names is found
 * separately, with {@link codeReferencePattern}.
 */
export function isDocsPath(path: string): boolean {
  if (SCRIPT_FILE.test(path) || DATA_FOLDER.test(path) || DATA_ROOT.test(path)) return false;
  return path.endsWith('.md') || DOCS_ROOTS.some((root) => path.startsWith(`${root}/`));
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The folders a docs file is in, below the docs root: code may read a whole folder. */
function foldersBelowDocsRoot(path: string): string[] {
  const root = DOCS_ROOTS.find((r) => path.startsWith(`${r}/`));
  if (root === undefined) return [];
  const folders: string[] = [];
  let folder = path.slice(0, path.lastIndexOf('/'));
  while (folder.length > root.length) {
    folders.push(folder);
    folder = folder.slice(0, folder.lastIndexOf('/'));
  }
  return folders;
}

/**
 * An extended regular expression (the same in `git grep -E` and JavaScript) that matches a
 * string literal naming `path`, or naming a folder `path` is in: `'v13/docs/DECISIONS.md'`,
 * `'v13/docs/migration'`, or a template string such as `v13/docs/syntax/${grammar}.md`. A docs file that source code
 * names this way may be read by a test or a generator, so a push that changes it is not
 * docs-only. A mention in backticks inside a comment also matches; that errs towards checking.
 */
export function codeReferencePattern(path: string): string {
  const quote = '[\'"`]';
  const file = `${escapeRegExp(path)}${quote}`;
  const folders = foldersBelowDocsRoot(path).map(escapeRegExp);
  const folder = folders.length > 0 ? `|(${folders.join('|')})(/?${quote}|/\\$\\{|/\\*)` : '';
  return `${quote}(\\.\\.?/)*(${file}${folder})`;
}

/** Above this many files the changed-file list is replaced by `.`, as `pnpm lint` runs it. */
const MAX_LINT_FILES = 2000;

/**
 * The arguments for ESLint and Prettier. ESLint gets the script files (it reports any other
 * explicit file as unmatched); Prettier gets every file and skips what it cannot parse
 * (`--ignore-unknown`). Both still apply their own ignore lists, as `pnpm lint` does.
 */
export function lintTargets(files: readonly string[]): { eslint: string[]; prettier: string[] } {
  if (files.length > MAX_LINT_FILES) return { eslint: ['.'], prettier: ['.'] };
  return { eslint: files.filter((file) => SCRIPT_FILE.test(file)), prettier: [...files] };
}

export interface WorkspacePackage {
  /** The package's folder, relative to the workspace root. */
  readonly dir: string;
  /** Its `typecheck` script, if it has one. */
  readonly typecheck?: string;
}

export interface TscStep {
  /** The folder `tsc` runs in, relative to the workspace root. */
  readonly cwd: string;
  /** The `-p` argument, relative to `cwd`. */
  readonly project: string;
  /** A file name for this step's `.tsbuildinfo`, unique among the steps. */
  readonly buildInfo: string;
}

const TSC_PROJECT = /^tsc -p (\S+)$/;
const EVERY_PACKAGE = 'pnpm -r --parallel run typecheck';

function tscSteps(script: string, cwd: string, where: string): TscStep[] {
  return script.split('&&').map((part) => {
    const project = TSC_PROJECT.exec(part.trim())?.[1];
    if (project === undefined)
      throw new Error(`${where}: cannot run \`${part.trim()}\` incrementally`);
    const buildInfo = (cwd === '.' ? project : `${cwd}/${project}`).replaceAll('/', '__');
    return { cwd, project, buildInfo };
  });
}

/**
 * Every `tsc -p` run of the root `typecheck` script, so that the hook can run each with
 * `--incremental`. The steps are read from the scripts themselves: a part that is not a plain
 * `tsc -p <project>` throws, and the caller then runs `pnpm typecheck` as it is.
 */
export function typecheckSteps(
  rootScript: string,
  packages: readonly WorkspacePackage[]
): TscStep[] {
  return rootScript.split('&&').flatMap((part) => {
    if (part.trim() !== EVERY_PACKAGE) return tscSteps(part, '.', 'the root typecheck script');
    return packages.flatMap(({ dir, typecheck }) =>
      typecheck === undefined ? [] : tscSteps(typecheck, dir, `${dir}'s typecheck script`)
    );
  });
}

export interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  /** Everything the check printed. */
  readonly output: string;
  /** Where that output is kept, relative to the workspace root. */
  readonly log: string;
}

/** How many lines of a failed check's output the report repeats; the log has the rest. */
const LOG_TAIL = 40;

function failureLines({ name, log, output }: CheckResult): string[] {
  const lines = output.trimEnd().split('\n');
  const above = lines.length - LOG_TAIL;
  return [
    '',
    `── ${name} failed (${log}) ──`,
    ...(above > 0 ? [`… ${above} lines above, in the log`] : []),
    ...lines.slice(-LOG_TAIL),
  ];
}

/** The closing report: every failed check with the end of its output. */
export function reportLines(results: readonly CheckResult[]): string[] {
  const failed = results.filter(({ ok }) => !ok);
  if (failed.length === 0) return [];
  const names = failed.map(({ name }) => name).join(', ');
  return [
    ...failed.flatMap(failureLines),
    '',
    `pre-push: ${failed.length} of ${results.length} checks failed: ${names}`,
  ];
}
