/**
 * The v12 side of ER parity: a plain-data snapshot of mermaid\@12's `ErDB`, in the shape of
 * v13's `ErModel` without AST ids and warnings.
 *
 * Normalisation, chosen so the snapshot holds what v12 drew and nothing else:
 * - text has v12's `encodeEntities` placeholders decoded back to what the author wrote, a name
 *   core cannot decode as `#name;` (D559);
 * - entities whose name is a subgraph id are left out (v12's `getData` draws none);
 * - entity ids (`entity-A-0`) are read back as names; a relationship end that is not an
 *   entity id named a subgraph;
 * - `cssClasses` (`default a b`) becomes the class list without `default`;
 * - subgraph members that name neither an entity nor a subgraph are left out: v12 also
 *   collected `classDef`, accessible titles and other statement values there, which place
 *   nothing;
 * - the front matter `title` is left out: core reads it, and the oracle never passes it on;
 * - rendering fields (`look`, `shape`, `labelType`, colour indexes) are left out.
 */
import { v12DecodeEntities as d } from '../v12-entities.ts';

/** `diagram.type` values mermaid\@12 reports for ER sources. */
export const ER_V12_TYPES = ['er'];

export interface ErSnapshot {
  direction: string;
  accTitle: string;
  accDescr: string;
  entities: {
    name: string;
    alias: string;
    attributes: { type: string; name: string; keys: string[]; comment: string }[];
    classes: string[];
    styles: string[];
  }[];
  relationships: {
    from: { name: string; subgraph: boolean; cardinality: string };
    to: { name: string; subgraph: boolean; cardinality: string };
    identifying: boolean;
    label: string;
  }[];
  subgraphs: {
    name: string;
    title: string;
    members: string[];
    direction: string | undefined;
    classes: string[];
    styles: string[];
  }[];
  classes: { name: string; styles: string[]; textStyles: string[] }[];
}

interface EntityV12 {
  id: string;
  alias: string;
  attributes: { type: string; name: string; keys: string[]; comment: string }[];
  cssClasses: string;
  cssStyles: string[];
}
interface ErDbV12 {
  getDirection(): string;
  getAccTitle(): string;
  getAccDescription(): string;
  getEntities(): Map<string, EntityV12>;
  getRelationships(): {
    entityA: string;
    roleA: string;
    entityB: string;
    relSpec: { cardA: string; cardB: string; relType: string };
  }[];
  getSubGraphs(): {
    id: string;
    title: string;
    nodes: string[];
    dir?: string;
    classes: string[];
    cssStyles?: string[];
  }[];
  getClasses(): Map<string, { id: string; styles: string[]; textStyles: string[] }>;
}

/** v12 cardinality constant → v13 `ErCardinality`. */
const CARDINALITY: Record<string, string> = {
  ZERO_OR_ONE: 'zeroOrOne',
  ZERO_OR_MORE: 'zeroOrMore',
  ONE_OR_MORE: 'oneOrMore',
  ONLY_ONE: 'onlyOne',
  MD_PARENT: 'mdParent',
};

export function erV12Snapshot(dbValue: unknown): ErSnapshot {
  const db = dbValue as ErDbV12;
  const all = db.getEntities();
  const subgraphs = db.getSubGraphs();
  const sgIds = new Set(subgraphs.map((s) => s.id));
  const byId = new Map<string, string>();
  for (const [name, e] of all) byId.set(e.id, name);
  const end = (ref: string, card: string) => {
    const name = byId.get(ref);
    return {
      name: d(name ?? ref),
      subgraph: name === undefined,
      cardinality: CARDINALITY[card] ?? card,
    };
  };
  const known = (m: string) => all.has(m) || sgIds.has(m);
  return {
    direction: db.getDirection(),
    accTitle: d(db.getAccTitle()),
    accDescr: d(db.getAccDescription()),
    entities: [...all]
      .filter(([name]) => !sgIds.has(name))
      .map(([name, e]) => ({
        name: d(name),
        alias: d(e.alias),
        attributes: e.attributes.map((a) => ({
          type: d(a.type),
          name: d(a.name),
          keys: [...a.keys],
          comment: d(a.comment),
        })),
        classes: e.cssClasses.split(' ').slice(1).map(d),
        styles: e.cssStyles.map(d),
      })),
    relationships: db.getRelationships().map((r) => ({
      from: end(r.entityA, r.relSpec.cardB),
      to: end(r.entityB, r.relSpec.cardA),
      identifying: r.relSpec.relType === 'IDENTIFYING',
      label: d(r.roleA),
    })),
    subgraphs: subgraphs.map((s) => ({
      name: d(s.id),
      title: d(s.title),
      members: s.nodes.filter(known).map(d),
      direction: s.dir,
      classes: s.classes.map(d),
      styles: (s.cssStyles ?? []).map(d),
    })),
    classes: [...db.getClasses().values()].map((c) => ({
      name: d(c.id),
      styles: c.styles.map(d),
      textStyles: c.textStyles.map(d),
    })),
  };
}
