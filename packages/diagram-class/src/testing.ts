/**
 * Test-only entry (`@mermaid-js/diagram-class/testing`): `routePath` is the flowchart's, copied
 * (packages never import each other); conformance checks the two draw the same paths. The marker
 * geometry is read by the class layout spec, to keep multiplicities clear of drawn markers. The
 * lexer's rule tables are read by the conformance spec of its first-character dispatch.
 */
export { MARKER_ACROSS, markerReach, markers, type Markers } from './render/markers.ts';
export { MARKER_ROOM } from './layout/prepare.ts';
export { CONDITIONS, RULES, rulesAt, type Scan } from './parser/rules.ts';
