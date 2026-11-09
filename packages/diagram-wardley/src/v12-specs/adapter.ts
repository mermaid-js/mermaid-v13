/**
 * Test-only adapter for the ported v12 wardley specs (R-TEST-3), backed by the v13 wardley
 * parse. The specs' expectations are kept as v12 wrote them; this file only translates names
 * and shapes:
 *
 * - `diagram.parser` and `diagram.db` stand for v12's wardley parser and its DB: `parse`
 *   rejects with the first error's message, and `getWardleyData()` gives the model as v12's
 *   builder built it (`WardleyBuildResult`: an annotation's point in `coordinates`, the
 *   evolution in `axes`, flags v12 left unset absent), with the title and accessibility getters;
 * - `WardleyBuilder` stands for v12's builder in its own spec: its node table is the one the
 *   v13 model is built with (`WardleyNodes`: `addNode`'s merge, `resolveNodeId`).
 */
import type { WardleyModel } from '../model.ts';
import { parseWardley } from '../parser/index.ts';
import { WardleyNodes } from '../parser/normalise.ts';
import type { NodeDraft } from '../parser/normalise.ts';

/** v12's `WardleyBuildResult`, from the model. */
function buildResult(model: WardleyModel | undefined) {
  const xy = (p: { x: number; y: number }) => ({ x: p.x, y: p.y });
  return {
    nodes: (model?.nodes ?? []).map(({ astId: _, ...n }) => ({
      ...n,
      ...(n.inPipeline ? {} : { inPipeline: undefined }),
      ...(n.isPipelineParent ? {} : { isPipelineParent: undefined }),
    })),
    links: (model?.links ?? []).map(({ astId: _, ...l }) => l),
    trends: (model?.trends ?? []).map(({ astId: _, ...t }) => t),
    pipelines: (model?.pipelines ?? []).map((p) => ({
      nodeId: p.nodeId,
      componentIds: [...p.componentIds],
    })),
    annotations: (model?.annotations ?? []).map((a) => ({
      number: a.number,
      coordinates: [xy(a)],
      text: a.text,
    })),
    notes: (model?.notes ?? []).map((n) => ({ text: n.text, ...xy(n) })),
    accelerators: (model?.accelerators ?? []).map((a) => ({ name: a.name, ...xy(a) })),
    deaccelerators: (model?.deaccelerators ?? []).map((a) => ({ name: a.name, ...xy(a) })),
    annotationsBox: model?.annotationsBox && xy(model.annotationsBox),
    axes: model?.evolution
      ? { stages: [...model.evolution.stages], stageBoundaries: [...model.evolution.boundaries] }
      : {},
    size: model?.size && { width: model.size.width, height: model.size.height },
  };
}

/** v12's wardley DB: plain functions (the spec reads them off the object), over the last model. */
function wardleyDb() {
  let model: WardleyModel | undefined;
  return {
    clear(): void {
      model = undefined;
    },
    load(next: WardleyModel): void {
      model = next;
    },
    getWardleyData: () => buildResult(model),
    getDiagramTitle: (): string => model?.title ?? '',
    getAccTitle: (): string => model?.accTitle ?? '',
    getAccDescription: (): string => model?.accDescr ?? '',
  };
}

const db = wardleyDb();

/** v12's `diagram` object from `wardleyDiagram.ts`, as the parser spec uses it. */
export const diagram = {
  db,
  parser: {
    /** v12's Jison-style hook, which the spec sets to the DB. */
    parser: { yy: undefined as unknown },
    parse(text: string): Promise<void> {
      const result = parseWardley(text);
      const error = result.diagnostics.find((d) => d.severity === 'error');
      if (error) return Promise.reject(new Error(error.message));
      db.load(result.model);
      return Promise.resolve();
    },
  },
};

/** v12's `WardleyBuilder`, as its spec drives it: `addNode` and `resolveNodeId`. */
export class WardleyBuilder {
  private readonly nodes = new WardleyNodes();

  addNode(node: NodeDraft): void {
    this.nodes.add(node);
  }

  resolveNodeId(name: string): string {
    return this.nodes.resolve(name);
  }
}
