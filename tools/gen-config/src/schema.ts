/**
 * Reading the config schema: YAML loading, `$ref`/`allOf` resolution and the walk over
 * every annotated key.
 */
import { parse } from 'yaml';

export type Status = 'honoured' | 'ignored' | 'pending' | 'removed' | 'moved';
export const STATUSES: readonly Status[] = ['honoured', 'ignored', 'pending', 'removed', 'moved'];

export interface Annotation {
  status: Status;
  since?: string;
  movedTo?: string;
  replacement?: string;
  reason?: string;
}

/** A JSON Schema node as it appears in `config.schema.yaml`. Loose on purpose. */
export interface SchemaNode {
  $ref?: string;
  allOf?: SchemaNode[];
  type?: string | string[];
  properties?: Record<string, SchemaNode>;
  additionalProperties?: boolean | SchemaNode;
  unevaluatedProperties?: boolean;
  default?: unknown;
  description?: string;
  enum?: unknown[];
  'meta:enum'?: Record<string, string>;
  tsType?: string;
  required?: string[];
  title?: string;
  'x-mermaid'?: unknown;
  [key: string]: unknown;
}

export interface RootSchema extends SchemaNode {
  $defs: Record<string, SchemaNode>;
}

export function loadSchema(source: string): RootSchema {
  // YAML 1.2 core schema, so `True` stays a string, as v12's js-yaml JSON_SCHEMA did.
  // `merge` off and aliases resolved to shared objects, which the walk below tolerates.
  const schema = parse(source, { schema: 'core', maxAliasCount: -1 }) as RootSchema;
  if (typeof schema !== 'object' || schema === null || typeof schema.$defs !== 'object') {
    throw new Error('config schema must be an object with $defs');
  }
  return schema;
}

/** Resolves a local `#/$defs/...` pointer. */
export function resolveRef(root: RootSchema, ref: string): SchemaNode {
  if (!ref.startsWith('#/')) {
    throw new Error(`unsupported $ref ${ref}`);
  }
  let node: unknown = root;
  for (const part of ref.slice(2).split('/')) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  if (typeof node !== 'object' || node === null) {
    throw new Error(`unresolved $ref ${ref}`);
  }
  return node as SchemaNode;
}

/** The def name when `ref` points at a whole `$defs` entry, e.g. `#/$defs/FontConfig`. */
export function defName(ref: string | undefined): string | undefined {
  const match = ref === undefined ? null : /^#\/\$defs\/([^/]+)$/.exec(ref);
  return match?.[1];
}

/**
 * Every property of an object schema, following `$ref` and `allOf`, in declaration order;
 * a node's own properties override inherited ones of the same name.
 */
export function collectProperties(root: RootSchema, node: SchemaNode): Map<string, SchemaNode> {
  const out = new Map<string, SchemaNode>();
  if (node.$ref !== undefined) {
    for (const [k, v] of collectProperties(root, resolveRef(root, node.$ref))) {
      out.set(k, v);
    }
  }
  for (const part of node.allOf ?? []) {
    for (const [k, v] of collectProperties(root, part)) {
      out.set(k, v);
    }
  }
  for (const [k, v] of Object.entries(node.properties ?? {})) {
    out.set(k, v);
  }
  return out;
}

export interface KeySite {
  /** Where the key is declared, e.g. `properties.theme` or `$defs.FlowchartDiagramConfig.properties.curve`. */
  where: string;
  key: string;
  node: SchemaNode;
}

/** Every key declared under any `properties:` in the file, each declaration once. */
export function declaredKeys(root: RootSchema): KeySite[] {
  const sites: KeySite[] = [];
  const seen = new Set<SchemaNode>();
  const visit = (node: SchemaNode, where: string) => {
    for (const [key, child] of Object.entries(node.properties ?? {})) {
      if (seen.has(child)) {
        continue; // a YAML alias: shares the anchor's annotation
      }
      seen.add(child);
      sites.push({ where: `${where}.properties.${key}`, key, node: child });
      visit(child, `${where}.properties.${key}`);
    }
  };
  visit(root, '#');
  for (const [name, def] of Object.entries(root.$defs)) {
    visit(def, `#/$defs/${name}`);
  }
  return sites;
}

/** Problems with the `x-mermaid` annotations; empty when every key is annotated correctly. */
export function annotationErrors(root: RootSchema): string[] {
  const errors: string[] = [];
  for (const { where, node } of declaredKeys(root)) {
    const ann = node['x-mermaid'];
    if (typeof ann !== 'object' || ann === null) {
      errors.push(`${where}: missing x-mermaid annotation`);
      continue;
    }
    const a = ann as Record<string, unknown>;
    if (!STATUSES.includes(a.status as Status)) {
      errors.push(`${where}: x-mermaid.status must be one of ${STATUSES.join(', ')}`);
    }
    for (const field of Object.keys(a)) {
      if (!['status', 'since', 'movedTo', 'replacement', 'reason'].includes(field)) {
        errors.push(`${where}: unknown x-mermaid field ${field}`);
      } else if (field !== 'status' && typeof a[field] !== 'string') {
        errors.push(`${where}: x-mermaid.${field} must be a string`);
      }
    }
    if (a.status === 'moved' && typeof a.movedTo !== 'string') {
      errors.push(`${where}: a moved key needs x-mermaid.movedTo`);
    }
    if (a.status === 'removed' && a.reason === undefined && a.replacement === undefined) {
      errors.push(`${where}: a removed key needs x-mermaid.reason or x-mermaid.replacement`);
    }
    if (a.status === 'ignored' && a.reason === undefined) {
      errors.push(`${where}: an ignored key needs x-mermaid.reason`);
    }
  }
  return errors;
}

export function annotationOf(node: SchemaNode): Annotation {
  return node['x-mermaid'] as Annotation;
}

export const isRemoved = (node: SchemaNode): boolean => annotationOf(node).status === 'removed';
