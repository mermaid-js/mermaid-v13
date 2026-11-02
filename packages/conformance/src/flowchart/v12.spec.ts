import { describe, expect, it } from 'vitest';
import { loadOracle } from '../index.ts';
import { FLOWCHART_V12_TYPES, flowchartV12Snapshot } from './v12.ts';

async function snapshotOf(source: string) {
  const result = await (await loadOracle()).parse(source);
  if (!result.accepted) throw new Error(result.error);
  expect(FLOWCHART_V12_TYPES).toContain(result.diagramType);
  return flowchartV12Snapshot(result.db);
}

describe('flowchart v12 DB snapshot', () => {
  it('captures vertices, edges, classes, subgraphs, tooltips and acc fields', async () => {
    const snap = await snapshotOf(
      [
        'flowchart LR',
        '  accTitle: Title',
        '  accDescr: Description',
        '  A["#quot;q#quot; & #9829;"] -->|hi| B((round))',
        '  classDef hot fill:#f00,color:#fff',
        '  class B hot',
        '  subgraph S [Group]',
        '    direction TB',
        '    B',
        '  end',
        '  click A "https://example.com" "tip" _blank',
      ].join('\n')
    );
    expect(snap).toEqual({
      direction: 'LR',
      accTitle: 'Title',
      accDescr: 'Description',
      vertices: [
        {
          id: 'A',
          text: '&quot;q&quot; & &#9829;',
          type: 'square',
          labelType: 'string',
          styles: [],
          // v12 adds `clickable` for click statements and normalises the URL.
          classes: ['clickable'],
          link: 'https://example.com/',
          linkTarget: '_blank',
          props: {},
          dir: undefined,
        },
        {
          id: 'B',
          text: 'round',
          type: 'circle',
          labelType: 'text',
          styles: [],
          classes: ['hot'],
          link: undefined,
          linkTarget: undefined,
          props: {},
          dir: undefined,
        },
      ],
      edges: [
        {
          start: 'A',
          end: 'B',
          type: 'arrow_point',
          stroke: 'normal',
          length: 1,
          text: 'hi',
          labelType: 'text',
          id: 'L_A_B_0',
          classes: [],
          style: undefined,
          interpolate: undefined,
        },
      ],
      classes: [{ id: 'hot', styles: ['fill:#f00', 'color:#fff'], textStyles: ['color:#fff'] }],
      subGraphs: [{ id: 'S', title: 'Group', nodes: ['B'], dir: 'TB', classes: [] }],
      tooltips: [['A', 'tip']],
    });
  });

  it('keeps vertex insertion order', async () => {
    const snap = await snapshotOf('graph TD\n  z --> a\n  m');
    expect(snap.vertices.map((v) => v.id)).toEqual(['z', 'a', 'm']);
  });
});
