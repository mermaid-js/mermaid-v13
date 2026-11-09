/**
 * Test-only adapter for the ported v12 C4 parser specs (R-TEST-3): v12's `c4Diagram.jison`
 * parser and its `c4Db`, backed by the v13 parse. The specs' expectations are kept as v12 wrote
 * them; this file only translates names and shapes:
 *
 * - `c4.parser.parse(text)` throws on an error diagnostic, as v12 threw on a syntax error, else
 *   hands the model to `c4.parser.yy` and returns `true`, as jison did;
 * - `c4Db.getC4ShapeArray()`, `getBoundaries()` and `getRels()` rebuild v12's DB objects: `label`,
 *   `descr`, `techn` and `type` as `{ text }`, every other field and `extra` name as its string,
 *   `typeC4Shape: { text }`, `parentBoundary` as the parent's alias (`global` at the top level),
 *   `wrap: false` (v12's after `clear()`); boundaries start with v12's root `global`;
 *   `getC4Shape(alias)` finds a shape, else a boundary, as the same objects;
 * - `getTitle()` is the model's title, `''` when none.
 */
import { parseC4 } from '../parser/index.ts';
import type { C4Boundary, C4Element, C4Extra, C4Model, C4Relation } from '../model.ts';

/** The fields v12 stored as `{ text }`. */
const TEXT_FIELDS = new Set(['label', 'descr', 'techn', 'type']);
/** The model fields that are not v12 fields of the same name. */
const STRUCTURAL = new Set(['ast', 'alias', 'kind', 'parent', 'extra', 'nodeKind', 'from', 'to']);

type V12Object = Record<string, unknown>;

/** Every field of a model item under v12's name and in v12's form. */
function v12Fields(
  item: C4Element | C4Boundary | C4Relation,
  extra: readonly C4Extra[]
): V12Object {
  const out: V12Object = {};
  for (const [key, value] of Object.entries(item) as [string, unknown][]) {
    if (STRUCTURAL.has(key) || value === undefined) continue;
    out[key] = TEXT_FIELDS.has(key) ? { text: value } : value;
  }
  for (const e of extra) out[e.name] = e.value;
  return out;
}

/** v12's DB arrays, rebuilt once per parse so lookups return the objects the getters do. */
interface V12Arrays {
  shapes: V12Object[];
  boundaries: V12Object[];
  rels: V12Object[];
}

function v12Arrays(model: C4Model | undefined): V12Arrays {
  const parent = (i: number) => (i < 0 ? 'global' : (model?.boundaries[i]?.alias ?? 'global'));
  const root: V12Object = {
    alias: 'global',
    label: { text: 'global' },
    type: { text: 'global' },
    tags: null,
    link: null,
    parentBoundary: '',
  };
  return {
    shapes: (model?.elements ?? []).map((e) => ({
      ...v12Fields(e, e.extra),
      alias: e.alias,
      typeC4Shape: { text: e.kind },
      parentBoundary: parent(e.parent),
      wrap: false,
    })),
    boundaries: [
      root,
      ...(model?.boundaries ?? []).map((b) => ({
        ...v12Fields(b, b.extra),
        alias: b.alias,
        ...(b.nodeKind !== undefined && { nodeType: b.nodeKind }),
        parentBoundary: parent(b.parent),
        wrap: false,
      })),
    ],
    rels: (model?.relations ?? []).map((r) => ({
      ...v12Fields(r, r.extra),
      type: r.kind,
      from: r.from,
      to: r.to,
      wrap: false,
    })),
  };
}

class C4DB {
  private current: C4Model | undefined;
  private arrays: V12Arrays = v12Arrays(undefined);

  get model(): C4Model | undefined {
    return this.current;
  }

  set model(model: C4Model | undefined) {
    this.current = model;
    this.arrays = v12Arrays(model);
  }

  clear(): void {
    this.model = undefined;
  }

  getC4ShapeArray(parentBoundary?: string | null): V12Object[] {
    const { shapes } = this.arrays;
    return parentBoundary === undefined || parentBoundary === null
      ? shapes
      : shapes.filter((s) => s.parentBoundary === parentBoundary);
  }

  getBoundaries(parentBoundary?: string | null): V12Object[] {
    const { boundaries } = this.arrays;
    return parentBoundary === undefined || parentBoundary === null
      ? boundaries
      : boundaries.filter((b) => b.parentBoundary === parentBoundary);
  }

  /** A shape by alias, else a boundary (v12's #4864 lookup). */
  getC4Shape(alias: string): V12Object | undefined {
    const { shapes, boundaries } = this.arrays;
    return shapes.find((s) => s.alias === alias) ?? boundaries.find((b) => b.alias === alias);
  }

  getRels(): V12Object[] {
    return this.arrays.rels;
  }

  getTitle(): string {
    return this.model?.title ?? '';
  }

  getC4Type(): string | undefined {
    return this.model?.c4Type;
  }

  getC4ShapeInRow(): number {
    return this.model?.shapeInRow ?? 4;
  }

  getC4BoundaryInRow(): number {
    return this.model?.boundaryInRow ?? 2;
  }

  getAccTitle(): string {
    return this.model?.accTitle ?? '';
  }

  getAccDescription(): string {
    return this.model?.accDescr ?? '';
  }
}

export const c4Db = new C4DB();

export const c4 = {
  parser: {
    yy: undefined as C4DB | undefined,
    parse(text: string): true {
      const result = parseC4(text);
      const error = result.diagnostics.find((d) => d.severity === 'error');
      if (error) throw new Error(error.message);
      if (this.yy) this.yy.model = result.model;
      return true;
    },
  },
};

/** v12's site config: v13 parses without one. */
export function setConfig(): void {
  // Nothing to set.
}
