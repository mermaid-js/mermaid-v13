import type { RenderContext } from '@mermaid-js/core';

/**
 * What the kanban renderer reads from the render context: the config (`kanban.useMaxWidth`,
 * `kanban.ticketBaseUrl`), the theme, the id prefix and version for the root, the security
 * level and the integrator's link schemes for ticket links (D377), and `warn` for
 * `URL_REFUSED` and `KANBAN_PRIORITY`.
 */
export type KanbanRenderContext = Pick<
  RenderContext,
  'config' | 'theme' | 'idPrefix' | 'version' | 'warn' | 'securityLevel'
> &
  Partial<Pick<RenderContext, 'linkSchemes'>>;
