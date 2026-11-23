/**
 * `@mermaid-js/diagram-mindmap`: the mindmap diagram plugin (spec #294): the plugin export
 * (`mindmap`), the lexer, parser, layout and SVG renderer entries, and the model and AST types.
 * The package's `mermaid` manifest registers it, with `./language` as the language facet.
 */
import type { DiagramPlugin } from '@mermaid-js/core';
import type { MindmapModel } from './model.ts';
import type { MindmapLayout } from './layout/layout.ts';

export { mindmap } from './plugin.ts';
export {
  detectMindmap,
  JISON_NAMES,
  MindmapTokenKind,
  mindmapTokens,
  parseMindmap,
} from './parser/index.ts';
export type * from './parser/index.ts';
export { MINDMAP_SECTIONS, mindmapSections } from './model.ts';
export type * from './model.ts';
export { mindmapIconName, mindmapIcons } from './icons.ts';
export { layoutMindmap } from './layout/layout.ts';
export type { MindmapLayout } from './layout/layout.ts';
export type { MindmapLayoutContext } from './layout/context.ts';
export { MINDMAP_CONFIG_IGNORED, prepareMindmap } from './layout/prepare.ts';
export type {
  MindmapEdgeView,
  MindmapIconSlot,
  MindmapNodeView,
  MindmapPrepared,
} from './layout/prepare.ts';
export { cloudOutline } from '@mermaid-js/shared/shapes/outline';
export { bangOutline } from './layout/outline.ts';
export type { Outline, OutlineArc } from '@mermaid-js/shared/shapes/outline';
export { renderMindmap } from './render/render.ts';
export type { MindmapRenderContext } from './render/context.ts';
export { ICON_NOT_RENDERED } from './render/assets.ts';

/** The plugin's contract. */
export type MindmapPlugin = DiagramPlugin<MindmapModel, MindmapLayout>;
