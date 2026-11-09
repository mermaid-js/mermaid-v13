/**
 * The render specs' sources (repo rule: no inline sources): the `.mmd` fixtures under
 * `e2e/diagrams/sankey/`, by their path in that folder without the extension
 * (`nightly-check/legacy-label-style-by-default`), and the conformance cases
 * (`packages/conformance/corpus/sankey-cases.json`), by id (`sankey-cases/links-repeated`).
 *
 * Vite's `import.meta.glob` (Vitest runs it) reads the files, so the package needs no Node
 * types; this file is a spec helper and is not built (`tsconfig.build.json`).
 */
type RawGlob = (
  pattern: string,
  options: { query: '?raw'; import: 'default'; eager: true }
) => Readonly<Record<string, string>>;

const ROOT = '../../../../e2e/diagrams/sankey/';
const MMD = (import.meta as ImportMeta & { glob: RawGlob }).glob(
  '../../../../e2e/diagrams/sankey/**/*.mmd',
  { query: '?raw', import: 'default', eager: true }
);
const CASES = Object.values(
  (import.meta as ImportMeta & { glob: RawGlob }).glob(
    '../../../conformance/corpus/sankey-cases.json',
    { query: '?raw', import: 'default', eager: true }
  )
)[0]!;

/** The source of the fixture at `path` (under `e2e/diagrams/sankey/`, without `.mmd`). */
export function fixture(path: string): string {
  const source = MMD[`${ROOT}${path}.mmd`];
  if (source === undefined) throw new Error(`no fixture e2e/diagrams/sankey/${path}.mmd`);
  return source;
}

/** The source of the conformance case `id` (`sankey-cases/<name>`). */
export function sankeyCase(id: string): string {
  const item = (JSON.parse(CASES) as { id: string; source: string }[]).find((c) => c.id === id);
  if (!item) throw new Error(`no case ${id} in packages/conformance/corpus/sankey-cases.json`);
  return item.source;
}
