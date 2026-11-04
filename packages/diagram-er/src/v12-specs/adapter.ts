/**
 * Test-only adapter for the ported v12 ER parser specs (R-TEST-3): v12's `erDiagram.parser.parse`
 * and `ErDB` getters, backed by the v13 ER parse. The specs' expectations are kept as v12
 * wrote them; this file only translates names and shapes:
 *
 * - entities are a `Map` from name to v12's entity record (`id` is `entity-<name>-<n>`,
 *   `cssClasses` is `default` plus the classes);
 * - a relationship end is that entity id, or the subgraph id it named;
 * - cardinalities are v12's constants (`ZERO_OR_MORE`, …), with `cardA` the one next to the
 *   second entity, as v12's grammar stored them.
 */
import { parseEr } from '../parser/index.ts';
import type { ErCardinality, ErModel } from '../parser/index.ts';

/** The specs set `securityLevel`; the parse reads no config. */
export function setConfig(next: Record<string, unknown>): void {
  void next;
}

const CARDINALITY: Record<ErCardinality, string> = {
  zeroOrOne: 'ZERO_OR_ONE',
  zeroOrMore: 'ZERO_OR_MORE',
  oneOrMore: 'ONE_OR_MORE',
  onlyOne: 'ONLY_ONE',
  mdParent: 'MD_PARENT',
};

interface EntityV12 {
  id: string;
  label: string;
  alias: string;
  attributes: { type: string; name: string; keys: string[]; comment: string }[];
  cssClasses: string;
  cssStyles: string[];
}

export class ErDB {
  private model: ErModel | undefined;

  readonly Cardinality = {
    ZERO_OR_ONE: 'ZERO_OR_ONE',
    ZERO_OR_MORE: 'ZERO_OR_MORE',
    ONE_OR_MORE: 'ONE_OR_MORE',
    ONLY_ONE: 'ONLY_ONE',
    MD_PARENT: 'MD_PARENT',
  };

  readonly Identification = {
    NON_IDENTIFYING: 'NON_IDENTIFYING',
    IDENTIFYING: 'IDENTIFYING',
  };

  clear(): void {
    this.model = undefined;
  }

  load(model: ErModel): void {
    this.model = model;
  }

  getEntities(): Map<string, EntityV12> {
    const out = new Map<string, EntityV12>();
    for (const e of this.model?.entities ?? []) {
      out.set(e.name, {
        id: `entity-${e.name}-${out.size}`,
        label: e.name,
        alias: e.alias,
        attributes: e.attributes.map(({ type, name, keys, comment }) => ({
          type,
          name,
          keys,
          comment,
        })),
        cssClasses: ['default', ...e.classes].join(' '),
        cssStyles: [...e.styles],
      });
    }
    return out;
  }

  getEntity(name: string): EntityV12 | undefined {
    return this.getEntities().get(name);
  }

  getRelationships(): Record<string, unknown>[] {
    const entities = this.getEntities();
    const ref = (end: { name: string; subgraph: boolean }) =>
      end.subgraph ? end.name : (entities.get(end.name)?.id ?? end.name);
    return (this.model?.relationships ?? []).map((r) => ({
      entityA: ref(r.from),
      roleA: r.label,
      entityB: ref(r.to),
      relSpec: {
        cardA: CARDINALITY[r.to.cardinality],
        relType: r.identifying ? 'IDENTIFYING' : 'NON_IDENTIFYING',
        cardB: CARDINALITY[r.from.cardinality],
      },
    }));
  }

  getClasses(): Map<string, { id: string; styles: string[]; textStyles: string[] }> {
    return new Map(
      (this.model?.classes ?? []).map((c) => [
        c.name,
        { id: c.name, styles: [...c.styles], textStyles: [...c.textStyles] },
      ])
    );
  }

  getSubGraphs(): Record<string, unknown>[] {
    return (this.model?.subgraphs ?? []).map((s) => ({
      id: s.name,
      nodes: [...s.members],
      title: s.title,
      classes: [...s.classes],
      cssStyles: [...s.styles],
      dir: s.direction,
      labelType: 'markdown',
    }));
  }

  getDirection(): string {
    return this.model?.direction ?? 'TB';
  }

  getAccTitle(): string {
    return this.model?.accTitle ?? '';
  }

  getAccDescription(): string {
    return this.model?.accDescr ?? '';
  }
}

const parser = {
  yy: new ErDB(),
  parse(text: string): void {
    const result = parseEr(text);
    const error = result.diagnostics.find((d) => d.severity === 'error');
    if (error) throw new Error(error.message);
    parser.yy.load(result.model);
  },
};

export default { parser };
