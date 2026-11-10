/**
 * The agentflow facet as an eager row (`FacetEntry.facet`), as a host bundling it would pass
 * it, for the service specs (`service-symbols`, `service-positions`) until agentflow's manifest
 * has its `language` entry (#550): the generated registry row has no `load` before then.
 */
import { agentflowLanguage, detectAgentflow } from '@mermaid-js/diagram-agentflow/language';
import type { FacetEntry } from '@mermaid-js/language-service';

export const AGENTFLOW_FACET_ROW: FacetEntry = {
  type: 'agentflow',
  id: 'agentflow',
  detector: detectAgentflow,
  facet: agentflowLanguage,
};
