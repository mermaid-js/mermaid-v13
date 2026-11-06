/**
 * Test-only adapter for the ported v12 mindmap specs (R-TEST-3): v12's `mindmap.jison` parser,
 * its `MindmapDB` and the config API, backed by the v13 parse. The specs' expectations are kept
 * as v12 wrote them; this file only translates names and shapes:
 *
 * - `parser.parse(text)` (imported as `mindmap` too) throws on an error diagnostic, as v12 threw
 *   on a syntax error and its DB on a second root, else hands the model to `parser.yy`;
 * - `MindmapDB.getMindmap()` returns v12's node tree (`nodeId`, `descr`, `type` as v12's
 *   `nodeType` number, `level`, `children`, `class` as one string, `icon`);
 * - `MindmapDB.getData()` returns the nodes and edges v12 laid out, with the sections, classes
 *   and icons the specs read, sections assigned with the `colorBy` set at that time;
 * - `configApi.setSiteConfig({ mindmap: { colorBy } })` sets that `colorBy`.
 *
 * The config lives in this module because v12's config was global (test-only; the v13 parser
 * keeps none).
 */
import { parseMindmap } from '../parser/index.ts';
import { mindmapSections } from '../model.ts';
import type { MindmapColorBy, MindmapModel, MindmapShape } from '../model.ts';

let colorBy: MindmapColorBy = 'branch';

export const configApi = {
  reset(): void {
    colorBy = 'branch';
  },
  setSiteConfig(config: { mindmap?: { colorBy?: MindmapColorBy } }): void {
    colorBy = config.mindmap?.colorBy ?? 'branch';
  },
  saveConfigFromInitialize(): void {
    // Nothing to save.
  },
};

/** v12's `nodeType`. */
const nodeType = {
  DEFAULT: 0,
  NO_BORDER: 0,
  ROUNDED_RECT: 1,
  RECT: 2,
  CIRCLE: 3,
  CLOUD: 4,
  BANG: 5,
  HEXAGON: 6,
} as const;

const TYPE: Record<MindmapShape, number> = {
  default: nodeType.DEFAULT,
  rounded: nodeType.ROUNDED_RECT,
  rect: nodeType.RECT,
  circle: nodeType.CIRCLE,
  cloud: nodeType.CLOUD,
  bang: nodeType.BANG,
  hexagon: nodeType.HEXAGON,
};

/** v12's `MindmapNode`, as `getMindmap()` returned it. */
interface V12Node {
  id: number;
  nodeId: string;
  descr: string;
  type: number;
  level: number;
  children: V12Node[];
  isRoot: boolean;
  class?: string;
  icon?: string;
}

/** A node of v12's `getData()`, the fields the specs read. */
interface V12LayoutNode {
  id: string;
  nodeId: string;
  label: string;
  labelType: 'markdown';
  level: number;
  section: number | undefined;
  cssClasses: string;
  icon: string | undefined;
}

/** An edge of v12's `getData()`. */
interface V12LayoutEdge {
  id: string;
  start: string;
  end: string;
  section: number | undefined;
  depth: number;
  classes: string;
}

export class MindmapDB {
  readonly nodeType = nodeType;
  model: MindmapModel | undefined;

  clear(): void {
    this.model = undefined;
  }

  getMindmap(): V12Node | null {
    const nodes = this.model?.nodes ?? [];
    const out: V12Node[] = nodes.map((n, id) => {
      const node: V12Node = {
        id,
        nodeId: n.id,
        descr: n.label,
        type: TYPE[n.shape],
        level: n.level,
        children: [],
        isRoot: n.parent === undefined,
      };
      if (n.classes.length > 0) node.class = n.classes.join(' ');
      if (n.icon) node.icon = n.icon.text;
      return node;
    });
    nodes.forEach((n, k) => {
      if (n.parent !== undefined) out[n.parent]?.children.push(out[k] as V12Node);
    });
    return out[0] ?? null;
  }

  getData(): { nodes: V12LayoutNode[]; edges: V12LayoutEdge[] } {
    const nodes = this.model?.nodes ?? [];
    const sections = mindmapSections(nodes, colorBy);
    return {
      nodes: nodes.map((n, k) => {
        const section = sections[k];
        const classes = ['mindmap-node'];
        if (n.parent === undefined) classes.push('section-root', 'section--1');
        else if (section !== undefined) classes.push(`section-${section}`);
        if (n.classes.length > 0) classes.push(n.classes.join(' '));
        const node: V12LayoutNode = {
          id: String(k),
          nodeId: n.id,
          label: n.label,
          labelType: 'markdown',
          level: n.level,
          section,
          cssClasses: classes.join(' '),
          icon: n.icon?.text,
        };
        return node;
      }),
      edges: nodes.flatMap((n, k): V12LayoutEdge[] => {
        if (n.parent === undefined) return [];
        const parent = nodes[n.parent];
        const section = sections[k];
        return [
          {
            id: `edge_${n.parent}_${k}`,
            start: String(n.parent),
            end: String(k),
            section,
            depth: parent?.level ?? 0,
            classes: `edge${section === undefined ? '' : ` section-edge-${section}`} edge-depth-${(parent?.level ?? 0) + 1}`,
          },
        ];
      }),
    };
  }
}

export const parser = {
  yy: undefined as MindmapDB | undefined,
  parse(text: string): void {
    const result = parseMindmap(text, { colorBy });
    const error = result.diagnostics.find((d) => d.severity === 'error');
    if (error) throw new Error(error.message);
    if (this.yy) this.yy.model = result.model;
  },
};

/** `mindmap.spec.ts` imports the parser as `mindmap`. */
export const mindmap = parser;

/** v12's logger switch: v13 parses without a logger. */
export function setLogLevel(): void {
  // Nothing to set.
}
