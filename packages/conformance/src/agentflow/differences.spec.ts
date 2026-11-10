import { describe, expect, it } from 'vitest';
import { parseAgentflow } from '@mermaid-js/diagram-agentflow';
import { loadOracle } from '../oracle.ts';
import { agentflowV12Snapshot } from './v12.ts';
import { agentflowV13Snapshot } from './v13.ts';

/**
 * Agentflow's listed differences that the parity snapshot does not see, because the model is
 * v12's and only a diagnostic differs: v13 warns where v12 was silent, or warns where v12
 * reported an error (spec #523). Each source is accepted by both, has v12's semantic model, and
 * gives the listed v13 diagnostics. The differences in accept/reject or in the model are in
 * `divergences/agentflow.json` (D462, D463, YAML anchors) and `parity.spec.ts`.
 */
const DIFFERENCES: { id: string; source: string; codes: string[]; reason: string }[] = [
  {
    id: 'prototype keys',
    source: 'agentflow-beta\n a@{ __proto__: x, constructor: y, prototype: z, keep: 1 }',
    codes: ['YAML_UNSAFE_KEY', 'YAML_UNSAFE_KEY', 'YAML_UNSAFE_KEY'],
    reason:
      "v12 dropped `__proto__`, `constructor` and `prototype` keys silently (`stripPrototypeKeys`); core's YAML reader drops them with a `YAML_UNSAFE_KEY` warning each, for flowchart and front matter too (spec #523).",
  },
  {
    id: 'removed shape',
    source: 'agentflow-beta\n a@{ shape: cylinder }',
    codes: ['SHAPE_REMOVED'],
    reason:
      'v12 reported `SHAPE_REMOVED` as an error yet drew the diagram; v13 reports it as a warning at the block (D461; `v12.ts` reads v12 so).',
  },
  {
    id: 'silent drops',
    source:
      'agentflow-beta\n f@{ view: collapsed }\n flow f\n  a@{ view: collapsed }\n end\n connectors --> b\n c --> d\n connector c',
    codes: [
      'AGENTFLOW_METADATA_DROPPED',
      'AGENTFLOW_VIEW_IGNORED',
      'AGENTFLOW_RESERVED_ID',
      'AGENTFLOW_CONNECTOR_REPLACED',
    ],
    reason: "v12 dropped these silently; v13 keeps v12's model and warns once per kind (D464).",
  },
  {
    id: 'labels that are not text',
    source: 'agentflow-beta\n a@{ label: 5 }\n b@{ label: x, labelType: bogus }',
    codes: ['NODE_DATA_COERCED', 'NODE_DATA_COERCED'],
    reason:
      "v12 read a label that is not text through its sanitiser's `toString` and an unknown `labelType` as `markdown`, silently; v13 reads them the same and warns (pitfall 10).",
  },
];

describe('agentflow differences in diagnostics only (spec #523)', () => {
  it.each(DIFFERENCES)('$id', async ({ source, codes }) => {
    const v12 = await (await loadOracle()).parse(source);
    expect(v12.accepted).toBe(true);
    const result = parseAgentflow(source);
    expect(result.diagnostics.map((d) => d.code)).toEqual(codes);
    expect(result.diagnostics.every((d) => d.severity === 'warning')).toBe(true);
    if (v12.accepted) {
      expect(agentflowV13Snapshot(result.model)).toEqual(agentflowV12Snapshot(v12.db));
    }
  });
});
