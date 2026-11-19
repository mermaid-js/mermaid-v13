/**
 * The plugins every dev page renders with, so the e2e page, the gallery and the Dev Explorer
 * draw the same diagram the same way (#391): `@mermaid-js/plugin-math` (`$$…$$`, MathJax loaded
 * only for a diagram with math, D178), `@mermaid-js/plugin-icons` with the static packs of
 * `icon-packs.ts` (D290–D299), and `@mermaid-js/plugin-hand-drawn` (`look: handDrawn`, D300).
 * ELK's layouts are registered beside them. `adapter.ts` and the explorer's bundle
 * (`browser/mermaid.ts`) both take this list.
 */
import elkLayouts from '@mermaid-js/layout-elk';
import handDrawn from '@mermaid-js/plugin-hand-drawn';
import icons from '@mermaid-js/plugin-icons';
import math from '@mermaid-js/plugin-math';
import type { LayoutLoader, Mermaid } from 'mermaid';
import { iconPacks } from './icon-packs.ts';

/** Layout engines the dev pages register (`registerLayoutLoaders`) besides the built-in one. */
export const devLayoutLoaders: readonly LayoutLoader[] = elkLayouts;

/** The extensions the dev pages register, in this order. */
export const devExtensions = [math, icons, handDrawn] as const;

/**
 * Registers the dev pages' layouts, `extensions` and the icon packs on `instance`, `before`
 * (the explorer's interactions plugin) first. Resolves when the extensions are active.
 */
export async function registerDevPlugins(
  instance: Mermaid,
  before: Parameters<Mermaid['registerExternalDiagrams']>[0] = []
): Promise<void> {
  instance.registerLayoutLoaders(devLayoutLoaders);
  const registered = instance.registerExternalDiagrams([...before, ...devExtensions]);
  instance.registerIconPacks(iconPacks);
  await registered;
}
