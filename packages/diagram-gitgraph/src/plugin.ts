import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { layoutGitGraph, type GitLayout } from './layout/index.ts';
import type { GitModel } from './model.ts';
import { detectGitGraph, parseGitGraph, type GitGraphParseResult } from './parser/index.ts';
import { renderGitGraph } from './render/index.ts';

/** A `gitGraph` config key read as the type it must have, else undefined (the default). */
function option<T extends 'string' | 'number'>(
  ctx: DiagramParseContext,
  key: string,
  type: T
): (T extends 'string' ? string : number) | undefined {
  const v = (ctx.config.gitGraph as Readonly<Record<string, unknown>> | undefined)?.[key];
  return typeof v === type ? (v as T extends 'string' ? string : number) : undefined;
}

/**
 * The gitGraph plugin (DESIGN §12.1, spec #292, D261): `layoutKind: 'custom'` with its own
 * `GitLayout`, LR, TB and BT. `parse` takes the whole source and seeds the main branch from
 * `mainBranchName` and `mainBranchOrder`; `layout` measures and places everything; `render`
 * writes the whole `<svg>` document. SVG only (D216). Labels are plain text (D268), so there is
 * no `labels` hook: no extension sees them. The manifest registers it as `gitGraph` (#374).
 */
export const gitGraph = {
  id: 'gitGraph',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  detector: (text: string): boolean => detectGitGraph(text),
  parse: (text: string, ctx: DiagramParseContext): GitGraphParseResult =>
    parseGitGraph(text, {
      preprocessed: ctx.preprocessed,
      mainBranchName: option(ctx, 'mainBranchName', 'string'),
      mainBranchOrder: option(ctx, 'mainBranchOrder', 'number'),
    }),
  layout: (model: GitModel, ctx: RenderContext): GitLayout => layoutGitGraph(model, ctx),
  render: (model: GitModel, layout: GitLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderGitGraph(model, layout, ctx, w),
} satisfies DiagramPlugin<GitModel, GitLayout>;
