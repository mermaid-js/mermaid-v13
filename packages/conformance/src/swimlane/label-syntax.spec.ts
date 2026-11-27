/**
 * Swimlane labels by the label rule (spec #1368, #1407): lane titles, node texts and edge
 * labels, through `createMermaid().render()`, over `swimlanes/pr-check/label-syntax*.mmd`. A
 * swimlane reads its own section over flowchart's (D534), so either sets `markdownAlwaysOn`.
 */
import { labelSyntaxSuite } from '../label-syntax.ts';

const quoted = `swimlane-beta LR
  subgraph L1["\`lane **bold**\`"]
    A["\`node **bold**\`"]
  end
  subgraph L2[Other]
    B[plain]
  end
  A -->|"\`edge _ital_\`"| B
`;

for (const section of ['swimlane', 'flowchart'])
  labelSyntaxSuite({ folder: 'swimlanes', section, kinds: ['lane', 'node', 'edge'], quoted });
