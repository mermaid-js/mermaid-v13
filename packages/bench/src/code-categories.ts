/**
 * The categories of the size report (#814, spec #813): which part of v13's source a file is.
 * The rules are data, tried in order; the first category with a matching pattern wins. Each
 * pattern is matched against the path from the repository root (`packages/<folder>/src/…`).
 *
 * There is no catch-all: `code-categories.spec.ts` fails when a counted file matches nothing,
 * so a new folder is given a category when it is added. The categories are those of spec #813's
 * table; `tooling` holds the private packages, which the table does not count.
 */

export type CategoryId =
  | 'tooling'
  | 'generated'
  | 'test'
  | 'editor'
  | 'ascii'
  | 'swimlane'
  | 'shared-layout'
  | 'theme-config'
  | 'plugins'
  | 'parsing'
  | 'render'
  | 'api';

export interface Category {
  id: CategoryId;
  label: string;
  /** Matched against `packages/<folder>/src/…`. */
  match: readonly RegExp[];
}

/** The `src/` of a diagram package or of `@mermaid-js/shared`, which holds code they share. */
const D = String.raw`^packages/(diagram-[^/]+|shared)/src/`;
/** Core's `src/`. */
const C = '^packages/core/src/';
const re = (...parts: string[]) => new RegExp(parts.join(''));

export const CATEGORIES: readonly Category[] = [
  {
    id: 'tooling',
    label: 'Private tooling (bench, conformance, dev); not in the spec #813 total',
    match: [/^packages\/(bench|conformance|dev)\/src\//],
  },
  {
    id: 'generated',
    label: 'Generated .ts',
    match: [/^packages\/[^/]+\/src\/(.*\/)?generated\//, /^packages\/[^/]+\/src\/.*\.gen\.ts$/],
  },
  {
    id: 'test',
    label: 'Test support kept in src',
    match: [
      /^packages\/[^/]+\/src\/(.*\/)?(fixtures|invariants|harness|test-context|testing|v12-specs|__tests__)(\/|\.ts$)/,
      /^packages\/[^/]+\/src\/.*\.fixtures\.ts$/,
    ],
  },
  {
    id: 'editor',
    label: 'Editor support (facets, language service)',
    match: [
      /^packages\/language-[^/]+\/src\//,
      /^packages\/[^/]+\/src\/(.*\/)?(facet|language)(\/|\.ts$)/,
      // Shared facet modules, named after the dialect they serve (`flow-facet.ts`).
      /^packages\/[^/]+\/src\/(.*\/)?[^/]+-(facet|facet-tables|completions|hover)\.ts$/,
    ],
  },
  {
    id: 'ascii',
    label: 'ASCII output',
    match: [/^packages\/[^/]+\/src\/ascii(\/|\.ts$)/],
  },
  {
    id: 'swimlane',
    label: 'Swimlane engine',
    match: [re(C, 'layout/swimlane/')],
  },
  {
    id: 'shared-layout',
    label: 'Shared layout (layered, compass, tree, hops)',
    match: [re(C, 'layout/'), /^packages\/shared\/src\/layout\//],
  },
  {
    id: 'theme-config',
    label: 'Theme and config',
    match: [re(C, '(theme|config)/'), re(D, '(theme/|config/|config\\.ts$|config-defaults\\.ts$)')],
  },
  {
    id: 'plugins',
    label: 'Plugins, ELK adapter, DOM',
    match: [
      /^packages\/(plugin-[^/]+|layout-elk|bundler-plugin)\/src\//,
      /^packages\/mermaid\/src\/dom\.ts$/,
    ],
  },
  {
    id: 'parsing',
    label: 'Parsing (lexers, parsers, AST, model building, preprocess)',
    match: [
      re(C, '(parser-kit|preprocess)/'),
      re(D, 'parser/'),
      re(D, '(model|semantic|normalise)\\.ts$'),
      re(D, 'beta/(ast|build|headers|lexer|model|parser|tokens)\\.ts$'),
    ],
  },
  {
    id: 'render',
    label: 'Diagram layout, render, SVG, text',
    match: [
      re(C, '(svg|text)/'),
      re(D, '(layout|render|shapes|svg|solver|schedule|dates|format|beta)/'),
      re(D, '(layout|render)\\.ts$'),
    ],
  },
  {
    id: 'api',
    label: 'API, pipeline, glue',
    match: [
      /^packages\/mermaid\/src\//,
      re(C, '(pipeline|limits|timing)/'),
      re(C, 'index\\.ts$'),
      // A diagram package's other top-level modules: index, plugin, labels, codes, ids, …
      re(D, '[^/]+\\.ts$'),
    ],
  },
];

/** The category of a counted file, or undefined when no rule matches it. */
export function categoryOf(path: string): CategoryId | undefined {
  return CATEGORIES.find((c) => c.match.some((m) => m.test(path)))?.id;
}
