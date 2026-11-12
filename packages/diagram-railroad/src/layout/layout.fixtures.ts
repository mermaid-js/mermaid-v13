/**
 * The layout specs' helpers (spec #526 T3): v12's spec measurer and path format, a layout
 * context, and every `.mmd` fixture under `e2e/diagrams/railroad/`, parsed as the plugin parses
 * it, with its own `railroad` config.
 *
 * Vite's `import.meta.glob` (Vitest runs it) reads the files, so the package needs no Node
 * types; this file is a spec helper and is not built (`tsconfig.build.json`).
 */
import type { ResolvedConfig } from '@mermaid-js/core/config';
import type { Diagnostic } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { Measurer } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';
import { railroadSectionOf } from '../config.ts';
import type { RailroadModel } from '../model.ts';
import { parseRailroad } from '../parser/index.ts';
import { visitExpressions } from './geometry.ts';
import type { RailroadLayoutContext } from './layout.ts';
import type { RailroadExpressionLayout, RailroadRuleLayout, TrackPath } from './types.ts';

/**
 * v12's spec measurer (`railroadRenderer.spec.ts:10-24`): `getBBox` stubbed to 8 px a character
 * (at least 1) and 16 px high, whatever the font.
 */
export const v12Measurer: Measurer = {
  id: 'railroad-v12-spec',
  width: (text) => Math.max([...text].length * 8, 1),
  metrics: () => ({ ascent: 12, descent: 4, lineHeight: 16 }),
};

/** A measurer that tells bold from normal: bold is 9 px a character, normal 8. */
export const boldMeasurer: Measurer = {
  id: 'railroad-bold',
  width: (text, font) => [...text].length * (font.weight >= 600 ? 9 : 8),
  metrics: (font) => ({ ascent: font.size * 0.75, descent: font.size / 4, lineHeight: font.size }),
};

/** A theme stand-in with v12's spec font (`monospace` 16 px) and nothing else. */
export const plainTheme = {
  value: (name: string) => (name === 'fontFamily' ? 'monospace' : ''),
  number: (name: string) => (name === 'fontSize' ? 16 : 0),
} as unknown as Theme;

/** A layout context with the `railroad` section `section`. */
export function context(
  section: Readonly<Record<string, unknown>> = {},
  measurer: Measurer = v12Measurer,
  theme: Theme = plainTheme
): RailroadLayoutContext {
  return { config: { railroad: section } as unknown as ResolvedConfig, measurer, theme };
}

/** `path` in v12's `PathBuilder` format (`M x y L x y A r r 0 0 sweep x y`). */
export function v12Path(path: TrackPath): string {
  const parts = [`M ${path.start.x} ${path.start.y}`];
  for (const s of path.segments) {
    parts.push(
      s.kind === 'line'
        ? `L ${s.x} ${s.y}`
        : `A ${s.radius} ${s.radius} 0 0 ${s.sweep ? 1 : 0} ${s.x} ${s.y}`
    );
  }
  return parts.join(' ');
}

/** The first expression of `kind` under `rule`, depth first (v12's `querySelector`). */
export function find(
  rule: RailroadRuleLayout,
  kind: RailroadExpressionLayout['kind']
): RailroadExpressionLayout | undefined {
  let hit: RailroadExpressionLayout | undefined;
  visitExpressions(rule, (e) => {
    if (!hit && e.kind === kind) hit = e;
  });
  return hit;
}

/** A source parsed: its model, diagnostics and the `railroad` config its text sets. */
export interface ParsedRailroad {
  readonly model: RailroadModel;
  readonly diagnostics: readonly Diagnostic[];
  readonly section: Record<string, unknown>;
}

/** `src` preprocessed and parsed as the plugin will, with its `railroad` config. */
export function parsed(src: string): ParsedRailroad {
  const preprocessed = preprocess(src);
  const { model, diagnostics } = parseRailroad(src, { preprocessed });
  return { model, diagnostics, section: railroadSectionOf(preprocessed) };
}

type RawGlob = (
  pattern: string,
  options: { query: '?raw'; import: 'default'; eager: true }
) => Readonly<Record<string, string>>;

const ROOT = '../../../../e2e/diagrams/railroad/';
const SOURCES = (import.meta as ImportMeta & { glob: RawGlob }).glob(
  '../../../../e2e/diagrams/railroad/**/*.mmd',
  { query: '?raw', import: 'default', eager: true }
);

/** Every e2e fixture, by its path under `e2e/diagrams/railroad/` without `.mmd`. */
export const FIXTURES: readonly (readonly [string, string])[] = Object.entries(SOURCES)
  .map(([path, source]) => [path.slice(ROOT.length, -'.mmd'.length), source] as const)
  .sort(([a], [b]) => (a < b ? -1 : 1));
