// Ported from v12 `swimlanes/__tests__/viewerSizedLayout.ts` at upstream `c9b12739f`. v12 parsed
// the fixture and applied its captured `.sizes.json`; here the fixture is its v13 capture
// (`ddlt.fixtures.ts`, flowchart's `LayoutGraph` with v13's measurer), laid out by the engine
// with the render's tuning, and returned as the engine's internal data, as v12 returned its
// `LayoutData`. The sizes the dev viewer measured in v12 still replace the nodes they name, and
// an `edge-label-<start>-<end>-<edge>` entry sizes that edge's label.
import type { LayoutGraph } from '../../types.ts';
import type { LayoutData } from '../layoutData.ts';
import { runSwimlane } from '../swimlane.ts';
import { DDLT_FIXTURES, fixtureGraph } from './ddlt.fixtures.ts';

export type NodeSizes = Record<string, readonly [width: number, height: number]>;

const EDGE_LABEL = /^edge-label-.*-(L_[^-]+)$/;

function withSizes(graph: LayoutGraph, sizes: NodeSizes): LayoutGraph {
  for (const [id, [width, height]] of Object.entries(sizes)) {
    const edgeId = EDGE_LABEL.exec(id)?.[1];
    const edge = edgeId ? graph.edges.find((e) => e.id === edgeId) : undefined;
    if (edge?.label) edge.label = { width, height };
    const node = graph.nodes.find((n) => n.id === id);
    if (node) [node.width, node.height] = [width, height];
  }
  return graph;
}

/**
 * Lays out a swimlane fixture, replacing the nodes named in `measuredInViewer` by the sizes the
 * dev viewer measured.
 */
export function layOutFixture(name: string, measuredInViewer: NodeSizes = {}): LayoutData {
  const tuning = DDLT_FIXTURES[name]?.tuning ?? {};
  return runSwimlane(withSizes(fixtureGraph(name), measuredInViewer), tuning);
}

/** v12 laid out a fixture without a sizes file from the viewer's sizes; every fixture has one here. */
export const layOutMeasured = layOutFixture;
