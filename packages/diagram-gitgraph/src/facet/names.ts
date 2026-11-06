/**
 * The gitGraph facet's parse and name checks (DESIGN §4.5, D92): the document's main branch
 * from its own config, the parse without main-branch symbols, and `isValidId`.
 */
import type { FacetParseOptions } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import { parseGitGraph } from '../parser/index.ts';
import type { GitGraphParseResult } from '../parser/index.ts';

/** The `gitGraph` config keys the parse reads. */
export interface DocumentGitConfig {
  mainBranchName?: string;
  mainBranchOrder?: number;
}

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * `gitGraph.mainBranchName` and `mainBranchOrder` as the document sets them: the front matter's
 * `config`, then each `init` directive in order (its `gitGraph` key, then its `config` key,
 * which v12 moves into the detected diagram's section), the last one winning. The site config
 * is the integrator's and not in the text: the service parses with v12's defaults under it.
 */
export function documentGitConfig(pre: PreprocessResult): DocumentGitConfig {
  const out: DocumentGitConfig = {};
  const take = (section: unknown) => {
    if (!isPlain(section)) return;
    const { mainBranchName: name, mainBranchOrder: order } = section;
    if (typeof name === 'string') out.mainBranchName = name;
    if (typeof order === 'number' && Number.isFinite(order)) out.mainBranchOrder = order;
  };
  const config = pre.frontMatter?.config;
  if (config) take(config.gitGraph);
  for (const d of pre.directives) {
    if (d.kind !== 'init' || !isPlain(d.args)) continue;
    take(d.args.gitGraph);
    take(d.args.config);
  }
  return out;
}

/**
 * The facet's parse: {@link parseGitGraph} with the document's main branch, and without the
 * main branch's symbol occurrences (its name is config, not text: renaming it in the text
 * would break the graph). The preprocess diagnostics are left to the service.
 */
export function parseDocument(text: string, options: FacetParseOptions): GitGraphParseResult {
  const pre = preprocess(text);
  const result = parseGitGraph(text, { ...options, preprocessed: pre, ...documentGitConfig(pre) });
  const main = result.model.mainBranch;
  const symbols = result.symbols.filter((s) => s.kind !== 'branch' || s.name !== main);
  return symbols.length === result.symbols.length ? result : { ...result, symbols };
}

/** A main branch name no text can write, so that `branch main` checks as a name. */
const NO_MAIN = '\u0000';

const BRANCH_RULE =
  'letters, digits and `_`, with `-`, `.` and `/` inside, not ending in `.` or `/`, not starting with a digit or `title`, and not a keyword; quote any other name';

/**
 * Why `name` cannot be written bare as an identifier of `kind` (D92). A branch name must lex
 * as one name where `branch`, `checkout` and `merge` take it, so it is checked by parsing it
 * there. A commit id is always quoted, so the service checks it between its quotes; only an
 * empty one is refused.
 */
export function invalidReason(name: string, kind = 'branch'): string | undefined {
  if (kind === 'commit') return name === '' ? 'A commit id cannot be empty.' : undefined;
  if (name === '') return 'A branch name cannot be empty.';
  const text = `gitGraph\nbranch ${name}\n`;
  const r = parseGitGraph(text, { mainBranchName: NO_MAIN });
  const [s, ...more] = r.symbols;
  const bare = s?.name === name && s.range.end - s.range.start === name.length;
  if (r.diagnostics.length === 0 && bare && more.length === 0) return undefined;
  return `'${name}' is not a bare branch name: ${BRANCH_RULE}.`;
}
