/**
 * The layout specs' models (spec #423 "Testing", R-LAYOUT-3): every `.mmd` fixture under
 * `e2e/diagrams/cynefin/`, parsed by the package's own parser, by its path in that folder
 * without the extension (`pr-check/should-render-an-empty-cynefin-framework`). The front
 * matter's config is not applied: the specs pass the layout config themselves.
 *
 * Vite's `import.meta.glob` (Vitest runs it) reads the files, so the package needs no Node
 * types; this file is a spec helper and is not built (`tsconfig.build.json`).
 */
import type { CynefinModel } from '../model.ts';
import { parseCynefin } from '../parser/index.ts';

type RawGlob = (
  pattern: string,
  options: { query: '?raw'; import: 'default'; eager: true }
) => Readonly<Record<string, string>>;

const ROOT = '../../../../e2e/diagrams/cynefin/';
const SOURCES = (import.meta as ImportMeta & { glob: RawGlob }).glob(
  '../../../../e2e/diagrams/cynefin/**/*.mmd',
  { query: '?raw', import: 'default', eager: true }
);

/** Every fixture's model, by its path under `e2e/diagrams/cynefin/` without `.mmd`. */
export const FIXTURES: Readonly<Record<string, CynefinModel>> = Object.fromEntries(
  Object.entries(SOURCES).map(([path, source]) => {
    const { model, diagnostics } = parseCynefin(source);
    const errors = diagnostics.filter((d) => d.severity === 'error');
    if (errors.length > 0) throw new Error(`${path}: ${errors.map((d) => d.message).join('; ')}`);
    return [path.slice(ROOT.length, -'.mmd'.length), model];
  })
);

/** The model of the fixture at `path` (under `e2e/diagrams/cynefin/`, without `.mmd`). */
export function fixture(path: string): CynefinModel {
  const model = FIXTURES[path];
  if (!model) throw new Error(`no fixture e2e/diagrams/cynefin/${path}.mmd`);
  return model;
}
