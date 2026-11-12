/**
 * The allowlists a gate can be satisfied through, read as one list of entries, and the rule
 * they hold (#695): each entry names an open issue or a decision id. See `allowlists.spec.ts`.
 *
 * | list           | where                                                            | reference |
 * | -------------- | ---------------------------------------------------------------- | --------- |
 * | `divergences`  | `packages/conformance/divergences/*.json`                        | `owner` (issue or D-id), D-ids in `reason` |
 * | `skips`        | `.skip(`, `.todo(` and `.fails(` in `packages/<pkg>/src` specs   | `packages/conformance/allowlists/skips.json` |
 * | `swimlane`     | `swimlane/__tests__/unresolvedTouches.json`, `v12Fixtures.json`  | `ref` of the entry |
 * | `lintDisables` | `eslint-disable` comments in tracked source                      | the comment's own text |
 *
 * Size budgets (`packages/mermaid/size-budget.json`) are not a list: each names the decision
 * that states its bytes (`budgetProblems`).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../corpus.ts';

type ListName = 'divergences' | 'skips' | 'swimlane' | 'lintDisables';

export interface Refs {
  /** Issue numbers of this repository, as written `#<n>`. */
  issues: number[];
  /** Decision ids, `D<n>`. */
  decisions: string[];
}

export interface Entry extends Refs {
  list: ListName;
  /** Names the entry within its list. */
  key: string;
  /** Repo-relative file the entry is in. */
  file: string;
}

export interface Rules {
  /** Every id with a row in `v13/docs/DECISIONS.md`. */
  decisions: ReadonlySet<string>;
  open: ReadonlySet<number>;
  /** Closed issues, and numbers that are not an issue of this repository. */
  closed: ReadonlySet<number>;
}

/** Entries from before the rule that name neither an open issue nor a decision. */
export interface Baseline {
  divergences: string[];
  skips: string[];
  swimlane: string[];
  /** Per file, how many disables carry no reference. */
  lintDisables: Record<string, number>;
}

const ALLOWLISTS = 'packages/conformance/allowlists';
const BASELINE_FILE = `${ALLOWLISTS}/baseline.json`;
export const ISSUE_STATES_FILE = `${ALLOWLISTS}/issue-states.json`;
const SKIP_REFS_FILE = `${ALLOWLISTS}/skips.json`;
const DECISIONS_FILE = 'v13/docs/DECISIONS.md';
const SWIMLANE_TESTS = 'packages/core/src/layout/swimlane/__tests__';
const UNRESOLVED_TOUCHES_FILE = `${SWIMLANE_TESTS}/unresolvedTouches.json`;
const V12_FIXTURES_FILE = `${SWIMLANE_TESTS}/v12Fixtures.json`;
const SIZE_BUDGET_FILE = 'packages/mermaid/size-budget.json';

const read = (path: string): string => readFileSync(join(REPO_ROOT, path), 'utf8');
const readJson = (path: string): unknown => JSON.parse(read(path));
const unique = <T>(items: T[]): T[] => [...new Set(items)];

/**
 * The references in a text: `#<n>` (not `repo#<n>`, an entity `&#40;` or a colour `#333a`) and
 * `D<n>`.
 */
export function refsIn(text: string): Refs {
  return {
    issues: unique([...text.matchAll(/(?<![\w&/#])#(\d+)(?![\w#])/g)].map((m) => Number(m[1]))),
    decisions: unique([...text.matchAll(/\bD\d+\b/g)].map((m) => m[0])),
  };
}

/** The ids with a row in the decision log. */
function decisionIds(text: string = read(DECISIONS_FILE)): Set<string> {
  return new Set([...text.matchAll(/^\| (D\d+) \|/gm)].map((m) => m[1]!));
}

/** The committed snapshot: issue number to `open`, `closed` or `unknown` (not an issue here). */
export type IssueStates = Record<string, 'open' | 'closed' | 'unknown'>;

export function rulesFor(states: IssueStates): Rules {
  const numbers = (open: boolean) =>
    Object.entries(states)
      .filter(([, state]) => (state === 'open') === open)
      .map(([n]) => Number(n));
  return {
    decisions: decisionIds(),
    open: new Set(numbers(true)),
    closed: new Set(numbers(false)),
  };
}

export function loadRules(): Rules {
  return rulesFor(readJson(ISSUE_STATES_FILE) as IssueStates);
}

export function loadBaseline(): Baseline {
  return readJson(BASELINE_FILE) as Baseline;
}

/** Tracked files and new ones not ignored, repo-relative. */
function sourceFiles(): string[] {
  const out = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }
  );
  return out.split('\0').filter((f) => f !== '');
}

function existing(path: string): string | undefined {
  try {
    return read(path);
  } catch {
    return undefined;
  }
}

type DivergenceRow = Record<'id' | 'kind' | 'reason' | 'owner', string>;

function divergenceEntries(): Entry[] {
  const dir = 'packages/conformance/divergences';
  return readdirSync(join(REPO_ROOT, dir))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .flatMap((f) =>
      (readJson(`${dir}/${f}`) as DivergenceRow[]).map(
        (d): Entry => ({
          list: 'divergences',
          key: `${d.id} (${d.kind})`,
          file: `${dir}/${f}`,
          issues: refsIn(d.owner).issues,
          decisions: refsIn(`${d.owner} ${d.reason}`).decisions,
        })
      )
    );
}

const SKIP_CALL = /^\s*(?:describe|it|test)\.(?:skip|todo|fails)\(\s*/gm;

/** The string literal at `from`, unescaped enough to name a test. */
function titleAt(text: string, from: number): string {
  const quote = text[from];
  if (quote !== "'" && quote !== '"' && quote !== '`') return text.slice(from, from + 40);
  let end = from + 1;
  while (end < text.length && text[end] !== quote) end += text[end] === '\\' ? 2 : 1;
  return text.slice(from + 1, end).replace(/\\(.)/g, '$1');
}

/** Every skipped, todo and expected-to-fail test of a spec, keyed `<title>` (`<title> #2` for a repeat). */
function skipsIn(text: string): string[] {
  const seen = new Map<string, number>();
  return [...text.matchAll(SKIP_CALL)].map((m) => {
    const title = titleAt(text, m.index + m[0].length);
    const n = (seen.get(title) ?? 0) + 1;
    seen.set(title, n);
    return n === 1 ? title : `${title} #${n}`;
  });
}

type SkipRefs = Record<string, Record<string, string>>;

function skipEntries(files: string[]): Entry[] {
  const refs = readJson(SKIP_REFS_FILE) as SkipRefs;
  const specs = files.filter((f) => /^packages\/[^/]+\/src\/.*\.spec\.ts$/.test(f));
  const entries: Entry[] = [];
  for (const file of specs) {
    const text = existing(file);
    if (text === undefined) continue;
    for (const title of skipsIn(text))
      entries.push({
        list: 'skips',
        key: `${file} > ${title}`,
        file,
        ...refsIn(refs[file]?.[title] ?? ''),
      });
  }
  return entries;
}

/** Keys of `skips.json` that no spec has any more. */
export function staleSkipRefs(entries: Entry[] = collectAll()): string[] {
  const keys = new Set(entries.filter((e) => e.list === 'skips').map((e) => e.key));
  return Object.entries(readJson(SKIP_REFS_FILE) as SkipRefs).flatMap(([file, titles]) =>
    Object.keys(titles)
      .map((title) => `${file} > ${title}`)
      .filter((key) => !keys.has(key))
  );
}

interface UnresolvedTouch {
  touch: string;
  /** The issue or decision that covers it. */
  ref: string;
}

function swimlaneEntries(): Entry[] {
  const touches = readJson(UNRESOLVED_TOUCHES_FILE) as Record<string, UnresolvedTouch[]>;
  const fixtures = readJson(V12_FIXTURES_FILE) as { notPorted: Record<string, string> };
  return [
    ...Object.entries(touches).flatMap(([fixture, list]) =>
      list.map(
        (t): Entry => ({
          list: 'swimlane',
          key: `touch in ${fixture}: ${t.touch}`,
          file: UNRESOLVED_TOUCHES_FILE,
          ...refsIn(t.ref),
        })
      )
    ),
    ...Object.entries(fixtures.notPorted).map(
      ([fixture, ref]): Entry => ({
        list: 'swimlane',
        key: `v12 fixture not ported: ${fixture}`,
        file: V12_FIXTURES_FILE,
        ...refsIn(ref),
      })
    ),
  ];
}

const LINTED = /\.(?:[cm]?[jt]sx?|vue)$/;
const LINT_DISABLE = new RegExp('(?://|/[*])\\s*eslint-disable(?:-next-line|-line)?(?![\\w-])');

function lintDisableEntries(files: string[]): Entry[] {
  const entries: Entry[] = [];
  for (const file of files) {
    if (!LINTED.test(file)) continue;
    const text = existing(file);
    if (text?.includes('eslint-disable') !== true) continue;
    text.split('\n').forEach((line, i) => {
      if (LINT_DISABLE.test(line))
        entries.push({ list: 'lintDisables', key: `${file}:${i + 1}`, file, ...refsIn(line) });
    });
  }
  return entries;
}

/** Every allowlist entry in the checkout. */
export function collectAll(): Entry[] {
  const files = sourceFiles();
  return [
    ...divergenceEntries(),
    ...skipEntries(files),
    ...swimlaneEntries(),
    ...lintDisableEntries(files),
  ];
}

/** What is wrong with the entries, given the baseline; empty when the rule holds. */
export function audit(entries: Entry[], baseline: Baseline, rules: Rules): string[] {
  const problems: string[] = [];
  const stands = (e: Entry) =>
    e.decisions.some((d) => rules.decisions.has(d)) || e.issues.some((n) => rules.open.has(n));
  const unlisted = (e: Entry): string[] =>
    e.issues
      .filter((n) => !rules.open.has(n) && !rules.closed.has(n))
      .map(
        (n) =>
          `${e.list}: ${e.key} names #${n}, which allowlists/issue-states.json does not have (run allowlist:issues --write)`
      );

  const lists: Exclude<ListName, 'lintDisables'>[] = ['divergences', 'skips', 'swimlane'];
  for (const list of lists) {
    const mine = entries.filter((e) => e.list === list);
    const allowed = new Set(baseline[list]);
    for (const e of mine) {
      const stale = unlisted(e);
      problems.push(...stale);
      if (stale.length > 0 || stands(e) || allowed.has(e.key)) continue;
      const unknown = e.decisions.filter((d) => !rules.decisions.has(d));
      if (unknown.length > 0)
        for (const d of unknown)
          problems.push(`${list}: ${e.key} names ${d}, which ${DECISIONS_FILE} does not have`);
      else if (e.issues.length === 0)
        problems.push(`${list}: ${e.key} names no open issue and no decision id`);
      else
        problems.push(
          `${list}: ${e.key} names only closed issues (${e.issues.map((n) => `#${n}`).join(', ')})`
        );
    }
    const byKey = new Map(mine.map((e) => [e.key, e]));
    for (const key of baseline[list]) {
      const e = byKey.get(key);
      let why: string | undefined;
      if (e === undefined) why = 'is not an entry any more';
      else if (stands(e)) why = 'now names a reference';
      if (why !== undefined)
        problems.push(
          `${list}: baseline lists ${key}, which ${why}: remove it and lower BASELINE_SIZE`
        );
    }
  }

  const disables = entries.filter((e) => e.list === 'lintDisables');
  for (const e of disables) problems.push(...unlisted(e));
  const bare = new Map<string, string[]>();
  for (const e of disables) if (!stands(e)) bare.set(e.file, [...(bare.get(e.file) ?? []), e.key]);
  for (const file of unique([...bare.keys(), ...Object.keys(baseline.lintDisables)]).sort()) {
    const keys = bare.get(file) ?? [];
    const allowed = baseline.lintDisables[file] ?? 0;
    if (keys.length > allowed)
      problems.push(
        `lintDisables: ${file} has ${keys.length} disables without a reference, the baseline allows ${allowed} (${keys.join(', ')})`
      );
    else if (keys.length < allowed)
      problems.push(
        `lintDisables: ${file} has ${keys.length} disables without a reference, the baseline says ${allowed}: lower it and BASELINE_SIZE`
      );
  }
  return problems;
}

export interface CitedBudget {
  name: string;
  gzipBytes: number;
  decision?: string;
}

export function sizeBudgets(): CitedBudget[] {
  const file = readJson(SIZE_BUDGET_FILE) as Record<
    string,
    { gzipBytes: number; decision?: string }
  >;
  return Object.entries(file).map(([name, b]) => ({
    name,
    gzipBytes: b.gzipBytes,
    decision: b.decision,
  }));
}

/**
 * A size budget names the decision that sets it, and that decision's row states the bytes
 * (`98,304 B`). So a changed number fails until a decision states the new one.
 */
export function budgetProblems(
  budgets: CitedBudget[],
  decisions: string = read(DECISIONS_FILE)
): string[] {
  return budgets.flatMap((b) => {
    const bytes = `${b.gzipBytes.toLocaleString('en-US')} B`;
    if (b.decision === undefined)
      return [`size budget ${b.name}: no "decision" (the D-id that sets ${bytes})`];
    const row = decisions.split('\n').find((line) => line.startsWith(`| ${b.decision} |`));
    if (row === undefined)
      return [`size budget ${b.name}: ${b.decision} is not in ${DECISIONS_FILE}`];
    return row.includes(bytes)
      ? []
      : [
          `size budget ${b.name}: ${bytes} is not what ${b.decision} states; a budget change cites the decision that sets it`,
        ];
  });
}
