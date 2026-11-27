/**
 * The theme colours an author wrote (D766). `Theme` resolves an author's value but does not say
 * whose a value is, so a diagram that must tell the author's colour from the theme's reads the
 * config the theme was built from. Venn lets an author's `venn<k>` win over its palette; timeline
 * names the `cScale` entries its active paint ignores.
 */
import { checkCssColor } from '@mermaid-js/core/svg';

/**
 * The names of `config.themeVariables` that hold a colour the theme accepts. A value the theme
 * drops (not a string, empty, or not a CSS colour) is not counted as written.
 */
export function authoredColours(config: {
  readonly themeVariables?: unknown;
}): ReadonlySet<string> {
  const vars = config.themeVariables;
  const names = new Set<string>();
  if (typeof vars !== 'object' || vars === null) return names;
  for (const [name, v] of Object.entries(vars)) {
    if (typeof v === 'string' && checkCssColor(v) !== undefined) names.add(name);
  }
  return names;
}
