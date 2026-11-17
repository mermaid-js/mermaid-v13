import type { RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import type { C4Layout } from '../layout/types.ts';
import type { Paints } from './paint.ts';

/**
 * What the C4 renderer reads from the render context: the config (`c4.useMaxWidth` and the
 * element palette), the theme, the id prefix and version for the root, and `warn` for
 * `C4_COLOR_INVALID`.
 */
export type C4RenderContext = Pick<
  RenderContext,
  'config' | 'theme' | 'idPrefix' | 'version' | 'warn'
>;

/**
 * What the painters read of a diagram's model (spec #730: they take this and a paint table, not
 * `C4Model`, so legacy C4 and c4-beta draw with the same code).
 */
export interface SceneView {
  /** The root's class after `mermaid mermaid-` and its `aria-roledescription`: `c4`, `c4beta`. */
  readonly name: string;
  /** The section's `useMaxWidth` as the config holds it: `c4`'s, or c4-beta's `c4beta`. */
  readonly maxWidth: unknown;
  /** The accessible title and description, trimmed; `''` for none. */
  readonly accTitle: string;
  readonly accDescr: string;
  /** The relation's `<title>`, by its index in the layout's `index`; none when it has none. */
  readonly relationTitle: (index: number) => string | undefined;
}

/** What every section of one render draws from. */
export interface Scene {
  readonly w: SvgWriter;
  readonly ctx: C4RenderContext;
  readonly view: SceneView;
  readonly layout: C4Layout;
  readonly paint: Paints;
  /** The theme's font family, which the root carries: text measured in it names no family. */
  readonly family: string;
}
