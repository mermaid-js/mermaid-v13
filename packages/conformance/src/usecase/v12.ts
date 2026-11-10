/**
 * The v12 side of usecase parity: a plain-data snapshot of mermaid\@12's usecase DB, its getters
 * in v12's order (`getActors()`, `getUseCases()`, `getSystemBoundaries()`, `getRelationships()`,
 * `getNotes()`, `getJsonNodes()`, `getClassDefs()`, `getDirection()`, `getAccTitle()`,
 * `getAccDescription()`), in the shape of v13's `UsecaseModel` without AST ids, JSON rows and
 * warnings. v12's DB is a module singleton: this copies what it needs right after the parse.
 *
 * Normalisation, chosen so the snapshot holds what v12 built and nothing else:
 * - text is what v12 drew: each `encodeEntities` placeholder (`#name;`, `#123;`) as the
 *   character a browser showed for the `&name;` v12's SVG wrote (the full HTML named set, the
 *   `entities` package; an unknown name stays `&name;`). v13 decodes core's set only, so a name
 *   outside it is a listed divergence. Ids and JSON tables are compared as v12's lexer read them;
 * - `ARROW_TYPE` numbers are v13's names; maps are their values in order.
 */
import { decodeHTMLStrict } from 'entities/decode';

/** `diagram.type` values mermaid\@12 reports for usecase sources. */
export const USECASE_V12_TYPES = ['usecase'];

/** v12's `ARROW_TYPE`, by number. */
const ARROW = [
  'point',
  'reversedPoint',
  'line',
  'circle',
  'cross',
  'reversedCircle',
  'reversedCross',
] as const;

/** A placeholder `ﬂ°name¶ß` / `ﬂ°°123¶ß`, which v12's SVG wrote as `&name;` / `&#123;`. */
const RE_PLACEHOLDER = /ﬂ°(°?)(\w+)¶ß/g;

/** v12's text as a browser drew it. */
export const shownV12 = (text: string): string =>
  text.replace(RE_PLACEHOLDER, (_, hash: string, name: string) =>
    decodeHTMLStrict(`&${hash ? '#' : ''}${name};`)
  );
const d = shownV12;
const opt = (v: string | undefined) => (v === undefined ? undefined : d(v));

export interface UsecaseSnapshot {
  actors: {
    id: string;
    label: string;
    labelType: string;
    type: string;
    icon: string | undefined;
    business: boolean;
    stereotype: string | undefined;
    parentId: string | undefined;
    classes: string[];
    styles: string[];
  }[];
  useCases: {
    id: string;
    label: string;
    labelType: string;
    shape: string;
    business: boolean;
    stereotype: string | undefined;
    parentId: string | undefined;
    classes: string[];
    styles: string[];
  }[];
  boundaries: {
    id: string;
    label: string;
    labelType: string;
    type: string;
    members: string[];
    classes: string[];
    styles: string[];
  }[];
  relationships: {
    id: string;
    explicitId: boolean;
    source: string;
    target: string;
    type: string;
    arrowType: string;
    label: string | undefined;
    labelType: string | undefined;
    minlen: number;
    classes: string[];
    styles: string[];
    animate: boolean;
    animation: string | undefined;
  }[];
  notes: { id: string; target: string; label: string; labelType: string }[];
  jsonNodes: {
    id: string;
    value: unknown;
    propertyOrder: Record<string, string[]>;
    classes: string[];
    styles: string[];
  }[];
  classDefs: { id: string; styles: string[] }[];
  direction: string;
  accTitle: string;
  accDescr: string;
}

interface Element {
  id: string;
  label: string;
  labelType: string;
  business: boolean;
  stereotype?: string;
  parentId?: string;
  classes: string[];
  styles: string[];
}

interface UsecaseDbV12 {
  getActors(): ReadonlyMap<string, Element & { type: string; icon?: string }>;
  getUseCases(): ReadonlyMap<string, Element & { shape: string }>;
  getSystemBoundaries(): ReadonlyMap<
    string,
    Omit<Element, 'business'> & { type: string; members: string[] }
  >;
  getRelationships(): readonly {
    id: string;
    explicitId: boolean;
    source: string;
    target: string;
    type: string;
    arrowType: number;
    label?: string;
    labelType?: string;
    minlen: number;
    classes: string[];
    styles: string[];
    animate: boolean;
    animation?: string;
  }[];
  getNotes(): ReadonlyMap<string, { id: string; target: string; label: string; labelType: string }>;
  getJsonNodes(): ReadonlyMap<
    string,
    {
      id: string;
      value: unknown;
      propertyOrder: Record<string, string[]>;
      classes: string[];
      styles: string[];
    }
  >;
  getClassDefs(): ReadonlyMap<string, { id: string; styles: string[] }>;
  getDirection(): string;
  getAccTitle(): string;
  getAccDescription(): string;
}

export function usecaseV12Snapshot(dbValue: unknown): UsecaseSnapshot {
  const db = dbValue as UsecaseDbV12;
  return structuredClone({
    actors: [...db.getActors().values()].map((a) => ({
      id: a.id,
      label: d(a.label),
      labelType: a.labelType,
      type: a.type,
      icon: opt(a.icon),
      business: a.business,
      stereotype: opt(a.stereotype),
      parentId: a.parentId,
      classes: [...a.classes],
      styles: a.styles.map(d),
    })),
    useCases: [...db.getUseCases().values()].map((u) => ({
      id: u.id,
      label: d(u.label),
      labelType: u.labelType,
      shape: u.shape,
      business: u.business,
      stereotype: opt(u.stereotype),
      parentId: u.parentId,
      classes: [...u.classes],
      styles: u.styles.map(d),
    })),
    boundaries: [...db.getSystemBoundaries().values()].map((b) => ({
      id: b.id,
      label: d(b.label),
      labelType: b.labelType,
      type: b.type,
      members: [...b.members],
      classes: [...b.classes],
      styles: b.styles.map(d),
    })),
    relationships: db.getRelationships().map((r) => ({
      id: r.id,
      explicitId: r.explicitId,
      source: r.source,
      target: r.target,
      type: r.type,
      arrowType: ARROW[r.arrowType] ?? String(r.arrowType),
      label: opt(r.label),
      labelType: r.labelType,
      minlen: r.minlen,
      classes: [...r.classes],
      styles: r.styles.map(d),
      animate: r.animate,
      animation: r.animation,
    })),
    notes: [...db.getNotes().values()].map((n) => ({
      id: n.id,
      target: n.target,
      label: d(n.label),
      labelType: n.labelType,
    })),
    jsonNodes: [...db.getJsonNodes().values()].map((j) => ({
      id: j.id,
      value: j.value,
      propertyOrder: j.propertyOrder,
      classes: [...j.classes],
      styles: j.styles.map(d),
    })),
    classDefs: [...db.getClassDefs().values()].map((c) => ({
      id: c.id,
      styles: c.styles.map(d),
    })),
    direction: db.getDirection(),
    accTitle: d(db.getAccTitle()),
    accDescr: d(db.getAccDescription()),
  });
}
