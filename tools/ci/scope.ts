/**
 * What a CI run has to check: everything, or, for a change to documentation only, its
 * formatting and the tests of the code that reads the changed files. The rule for "documentation" is the
 * pre-push hook's (`tools/pre-push/plan.ts`), so a push that the hook lets through on Prettier
 * alone gets the same treatment from CI. Pure: the git work is in `scope-cli.ts`.
 */
import { isDocsPath } from '../pre-push/plan.ts';

export interface CiScope {
  /** `code`: every job runs. `docs`: lint, and the tests related to `readers` if there are any. */
  readonly scope: 'code' | 'docs';
  readonly reason: string;
  /**
   * The source files that name a changed docs file: a `docs` run gives them to
   * `vitest related`, which runs the specs among them and the specs that import the others.
   */
  readonly readers: readonly string[];
}

const code = (reason: string): CiScope => ({ scope: 'code', reason, readers: [] });

/** The events whose checkout has the change as `HEAD^1..HEAD`. */
const DIFFED_EVENTS = ['pull_request', 'push'];

/**
 * `files`: what the change touches. `readers`: the source files that name one of them (see
 * `codeReferencePattern`), or undefined when that search failed. Every doubt ends in `code`.
 */
export function ciScope(input: {
  readonly event: string;
  readonly files: readonly string[] | undefined;
  readonly readers: readonly string[] | undefined;
}): CiScope {
  const { event, files, readers } = input;
  if (!DIFFED_EVENTS.includes(event)) return code(`a ${event} run checks everything`);
  if (files === undefined || files.length === 0) return code('the changed files are not known');
  const notDocs = files.find((file) => !isDocsPath(file));
  if (notDocs !== undefined) return code(`not documentation: ${notDocs}`);
  if (readers === undefined) return code('the search for code that reads the docs failed');
  const count = `${files.length} ${files.length === 1 ? 'file' : 'files'}`;
  return {
    scope: 'docs',
    reason:
      readers.length === 0
        ? `${count} changed, all documentation that no code reads`
        : `${count} changed, all documentation; ${readers.length} source files read them`,
    readers: [...readers].sort(),
  };
}

/** The job summary (Markdown). */
export function summarize(result: CiScope): string {
  const lines = [`### CI scope: ${result.scope}`, '', result.reason];
  if (result.readers.length > 0) {
    lines.push('', 'The tests related to these run:', '');
    lines.push(...result.readers.map((reader) => `- \`${reader}\``));
  }
  return `${lines.join('\n')}\n`;
}
