/**
 * Test harness (`@mermaid-js/diagram-kanban/testing`): the shared render harness
 * (`@mermaid-js/shared/testing/render-harness`) over the kanban plugin and its theme table.
 * `mermaid` renders kanban through the registry (#459).
 */
import {
  createRenderHarness,
  type TestRender,
  type TestRenderOptions,
} from '@mermaid-js/shared/testing/render-harness';
import type { KanbanLayout } from '../layout/index.ts';
import type { KanbanModel } from '../model.ts';
import type { KanbanDocument } from '../parser/index.ts';
import { kanban } from '../plugin.ts';

export { TEST_VERSION } from '@mermaid-js/shared/testing/test-context';

export type RenderKanbanOptions = Pick<
  TestRenderOptions,
  'config' | 'idPrefix' | 'securityLevel' | 'linkSchemes' | 'outline' | 'measurer'
>;

export type RenderedKanban = TestRender<KanbanModel, KanbanLayout, KanbanDocument>;

/** Renders `input` (a source, parsed with its front matter and directives, or a model). */
export const renderKanbanForTest: (
  input: string | KanbanModel,
  options?: RenderKanbanOptions
) => Promise<RenderedKanban> = createRenderHarness(kanban);
