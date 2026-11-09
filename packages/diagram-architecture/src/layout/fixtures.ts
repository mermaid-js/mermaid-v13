/**
 * What the layout specs lay out with: a measurer whose sizes are worked out by hand, a theme,
 * and a context over the defaults. Models come from the parser (`parseArchitecture`), never by
 * hand. The parser-produced corpus spec is `packages/conformance/src/architecture/layout.spec.ts`.
 */
import { CORE_DEFAULTS, resolveConfig, type ConfigInput } from '@mermaid-js/core/config';
import type { LayoutEngine } from '@mermaid-js/core/layout';
import type { Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme, type ThemeName } from '@mermaid-js/core/theme';
import type { ArchitectureModel } from '../model.ts';
import { parseArchitecture } from '../parser/index.ts';
import type { ArchitectureLayoutContext } from './context.ts';

/** Every character is 10 px wide; a line is 20 px high. */
export const gridMeasurer: Measurer = {
  id: 'grid-10x20',
  width: (text) => [...text].length * 10,
  metrics: () => ({ ascent: 15, descent: 5, lineHeight: 20 }),
};

/** A fresh theme (one per layout: a theme records the variables read). */
export async function themeNamed(name: ThemeName = 'default'): Promise<Theme> {
  return createTheme(await loadTheme(name));
}

/** A layout context for `engine`, with `config` over the defaults; it collects the warnings. */
export function contextFor(
  engine: LayoutEngine,
  theme: Theme,
  config: ConfigInput = {},
  measurer: Measurer = gridMeasurer
): ArchitectureLayoutContext & { warnings: { code: string; path?: string }[] } {
  const warnings: { code: string; path?: string }[] = [];
  const resolved = resolveConfig(CORE_DEFAULTS, {}, config);
  return {
    config: resolved,
    measurer,
    theme,
    layout: (graph) => engine(graph, { config: resolved }),
    warn: (w) => warnings.push(w),
    warnings,
  };
}

/** The model of `source`, which must parse without an error. */
export function modelOf(source: string): ArchitectureModel {
  const r = parseArchitecture(source);
  const errors = r.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) throw new Error(errors.map((d) => d.message).join('\n'));
  return r.model;
}
