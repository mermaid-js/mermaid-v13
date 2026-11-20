/**
 * The capture tool's parts (`cli/capture-theme-overrides.ts`, D654): where the diagram theme
 * tables are, how v12's value of a variable is read, and how a pasted table is checked against a
 * fresh capture. `override-matrix.ts` says how to run the tool.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { v12Value } from './diagram-themes.ts';
import { hex } from './hex.ts';
import {
  THEMES,
  captureReference,
  formatReference,
  type Classic,
  type Colour,
  type ReferenceTable,
  type Resolve,
  type ThemeReference,
} from './override-matrix.ts';

export interface TableFile {
  /** The type's folder under `packages/conformance/src/`. */
  readonly type: string;
  /** Its `packages/diagram-<type>/src/theme/table.ts`. */
  readonly path: string;
}

/**
 * Every first-party diagram theme table, found from `packages/diagram-<type>/src/theme/table.ts`,
 * by the conformance folder whose name is the package's in any case (`treeView`).
 */
export function findTables(src: string, packages: string): TableFile[] {
  const folders = readdirSync(src, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  return readdirSync(packages)
    .filter((dir) => dir.startsWith('diagram-'))
    .sort()
    .map((dir) => ({
      name: dir.slice('diagram-'.length),
      path: join(packages, dir, 'src/theme/table.ts'),
    }))
    .filter(({ path }) => existsSync(path))
    .map(({ name, path }) => ({
      type: folders.find((f) => f.toLowerCase() === name) ?? name,
      path,
    }));
}

/**
 * v12's colour of a variable in its resolved theme variables, as `diagram-themes.ts` `v12Value()`
 * reads it from `table`: the flat name, or the variable's nested key in the table's `section`.
 */
export function v12Colour(
  old: Readonly<Record<string, unknown>>,
  name: string,
  table?: DiagramThemeTable
): Colour {
  return hex(v12Value(old, name, table === undefined ? [] : [table]), () => null);
}

/** A reference table of `names`, from a resolver per classic theme. */
export async function captureTable(
  names: readonly string[],
  resolverFor: (theme: Classic) => Promise<Resolve>
): Promise<ReferenceTable> {
  const out: Partial<Record<Classic, ThemeReference>> = {};
  for (const theme of THEMES) out[theme] = captureReference(names, await resolverFor(theme));
  return out as ReferenceTable;
}

/**
 * One type's spec against a fresh capture, printed as `name`: a problem, or undefined when the
 * spec holds the table byte for byte, or when there is no colour to compare and no spec.
 */
export function checkPasted(
  type: string,
  table: ReferenceTable,
  spec: string | undefined,
  name: string
): string | undefined {
  const empty = THEMES.every((t) => Object.keys(table[t]).length === 0);
  if (empty) return spec === undefined ? undefined : `${type}: no colour to compare, but a spec`;
  if (spec === undefined) return `${type}: no spec`;
  return spec.includes(formatReference(name, table))
    ? undefined
    : `${type}: the pasted ${name} differs from a fresh capture`;
}
