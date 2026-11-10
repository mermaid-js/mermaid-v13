/**
 * Flowchart's swimlane lane drawing and warnings (spec #528, D536), a lazily loaded part of its
 * own: `mermaid` loads it with the `swimlane` layout for flowcharts (`layoutParts`), so a plain
 * flowchart, or another diagram on the swimlane engine, loads none of it (R-PERF-1). A host
 * that registers it itself does so under the layout name `flowchartLanes`.
 */
export { makeLanes as default, makeLanes } from './render/lanes.ts';
