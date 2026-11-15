/**
 * What a draw needs loaded, and the theme it paints with (DESIGN §3 `prepare` step 5,
 * `renderSync` step 1): the layout engine and part, line hops, themes and the plugin's own
 * resources, for one analysis.
 */
import type { Resource, Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import {
  createTheme,
  DEFAULT_THEME,
  loadedTheme,
  loadTheme,
  resolveThemeName,
  type Theme,
  type ThemeName,
  type ThemeOptions,
} from '@mermaid-js/core/theme';
import type { Analysis } from './analysis-cache.ts';
import type { Snapshot } from './config-snapshot.ts';
import { layoutName, LINE_HOPS, type Registry } from './registry.ts';

function themeNames(config: ResolvedConfig): ThemeName[] {
  const choice = resolveThemeName(config.theme);
  return choice.dark ? [choice.name, choice.dark] : [choice.name];
}

/** The layout, themes and plugin resources `a` needs that are not loaded yet. */
export function missingFor(registry: Registry, a: Analysis, text = false): Resource[] {
  const missing: Resource[] = [];
  const { config } = a.prepared;
  // Text output lays out with core's own `layered`, never a registered engine (D179).
  if (a.plugin.layoutKind === 'graph' && !text) {
    const name = layoutName(config, a.plugin);
    const { need } = registry.layout(name, a.plugin.layoutEngine);
    if (need !== undefined) missing.push({ kind: 'layout', name: need });
    const [part, loaded] = registry.layoutPart(a.plugin, name);
    if (part && !loaded) missing.push({ kind: 'layout', name: part });
  }
  // D537: the line-hop chunk when the shared key turns hops on. An engine whose own `lineHops`
  // defaults on (`swimlane`, ELK) carries the step, so loading it loads them.
  if (!text && !registry.hops && config.lineHops) missing.push({ kind: 'layout', name: LINE_HOPS });
  // Text output draws no colours, so it needs no theme (D82).
  for (const name of text ? [] : themeNames(config)) {
    if (!loadedTheme(name)) missing.push({ kind: 'theme', name });
  }
  for (const r of a.plugin.resources?.(a.prepared.parse, config) ?? []) missing.push(r);
  return missing;
}

export async function loadResources(
  registry: Registry,
  missing: readonly Resource[]
): Promise<void> {
  await Promise.all(
    missing.map(async (r) => {
      if (r.kind === 'layout') await registry.loadLayout(r.name);
      else if (r.kind === 'theme') await loadTheme(r.name as ThemeName);
      else if (r.kind === 'diagram') await registry.load(r.name);
    })
  );
}

/** The theme a draw paints with: the config's choice, or the default when it is not loaded. */
export function themeFor(
  config: ResolvedConfig,
  s: Snapshot,
  warn: (w: Warning) => void,
  tables: Pick<ThemeOptions, 'rules' | 'diagram'>,
  idPrefix: () => string
): Theme {
  const choice = resolveThemeName(config.theme, warn);
  const spec = loadedTheme(choice.name) ?? loadedTheme(DEFAULT_THEME)!;
  return createTheme(spec, {
    themeVariables: config.themeVariables as Record<string, unknown> | undefined,
    dark: choice.dark ? loadedTheme(choice.dark) : undefined,
    ...tables,
    cssVariables: s.options.output?.cssVariables,
    warn,
    idPrefix,
  });
}
