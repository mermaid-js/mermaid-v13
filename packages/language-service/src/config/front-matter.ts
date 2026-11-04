/**
 * Front matter in the service (DESIGN §4.5, R-LANG-5, D96): the YAML node tree of the front
 * matter (the reader's tree mode, which keeps reading after an error), the key under an
 * offset, and the unknown-key warnings of `config:` checked against the config JSON schema.
 * `%%{init}%%` directives keep their preprocess diagnostics only.
 */
import type { Diagnostic, Range } from '@mermaid-js/core/parser-kit';
import { parseYaml } from '@mermaid-js/core/preprocess';
import type { YamlMapNode, YamlNode, YamlPair } from '@mermaid-js/core/preprocess';
import type { DocumentContext } from '../context.ts';
import { SchemaView, annotationOf } from './schema.ts';
import type { SchemaNode } from './schema.ts';

/** The front matter of one snapshot, read once. */
export interface FrontMatterTree {
  /** The whole block, fences included. */
  readonly range: Range;
  /** The YAML between the fences. */
  readonly yamlRange: Range;
  /** The fence's indent, which every YAML line shares. */
  readonly indent: number;
  /** The document's root node; `null` when nothing could be read. */
  readonly root: YamlNode | null;
}

export function frontMatterTree(ctx: DocumentContext): FrontMatterTree | undefined {
  const fm = ctx.pre.frontMatter;
  if (fm === undefined) return undefined;
  const fence = ctx.text.indexOf('---', fm.range.start);
  const indent = ctx.text.slice(fm.range.start, fence);
  const { root } = parseYaml(ctx.text, {
    start: fm.yamlRange.start,
    end: fm.yamlRange.end,
    indent,
    tree: true,
  });
  return { range: fm.range, yamlRange: fm.yamlRange, indent: indent.length, root };
}

/** The mapping at a key path from the root (the first pair of a key), if there is one. */
export function mapAt(root: YamlNode | null, path: readonly string[]): YamlMapNode | undefined {
  let node: YamlNode | null | undefined = root;
  for (const key of path) {
    node = node?.kind === 'map' ? node.pairs.find((p) => p.key === key)?.value : undefined;
  }
  return node?.kind === 'map' ? node : undefined;
}

/** The key whose text holds `offset` (or ends at it), with its path from the root. */
export function keyAt(
  root: YamlNode | null,
  offset: number
): { path: string[]; pair: YamlPair } | undefined {
  const path: string[] = [];
  let node: YamlNode | null | undefined = root;
  while (node?.kind === 'map') {
    const pairs: readonly YamlPair[] = node.pairs;
    const hit = pairs.find((p) => p.keyRange.start <= offset && offset <= p.keyRange.end);
    if (hit) return { path: [...path, hit.key], pair: hit };
    const inner = pairs.find(
      (p) => p.value !== undefined && p.value.range.start <= offset && offset <= p.value.range.end
    );
    if (inner === undefined) return undefined;
    path.push(inner.key);
    node = inner.value;
  }
  return undefined;
}

// ---------------------------------------------------------------------------- warnings

/** Edit distance with an early exit once it passes `max` (keys are short; this stays cheap). */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      const v = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
      row.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length]!;
}

/** The known key closest to `key`, when one is close enough to be a typo of it. */
export function closest(key: string, known: Iterable<string>): string | undefined {
  const lower = key.toLowerCase();
  const max = Math.min(3, Math.max(1, Math.floor(key.length / 3)));
  let best: string | undefined;
  let bestDistance = max + 1;
  for (const k of known) {
    const d = distance(lower, k.toLowerCase(), max);
    if (d < bestDistance) {
      best = k;
      bestDistance = d;
    }
  }
  return best;
}

/** Keys a user can still set (not removed or moved). */
export function liveKeys(props: Map<string, SchemaNode>): string[] {
  return [...props]
    .filter(([, n]) => !['removed', 'moved'].includes(annotationOf(n).status))
    .map(([k]) => k);
}

/**
 * Warnings for the keys of `config:` that a render would warn about (core `resolveConfig`):
 * unknown keys (with a "did you mean"), removed and moved keys. Keys with no value are skipped,
 * as `resolveConfig` skips them; so are lists and the keys of open objects (`themeVariables`).
 */
export function configDiagnostics(
  ctx: DocumentContext,
  fm: FrontMatterTree | undefined
): Diagnostic[] {
  const config = mapAt(fm?.root ?? null, ['config']);
  if (config === undefined || ctx.schema === undefined) return [];
  const schema = new SchemaView(ctx.schema);
  const out: Diagnostic[] = [];
  // A third-party diagram's own section is its business, as in `resolveSite`.
  const ownSection =
    ctx.entry !== undefined && schema.root.properties?.[ctx.entry.id] === undefined
      ? ctx.entry.id
      : undefined;

  const walk = (map: YamlMapNode, node: SchemaNode, path: string) => {
    const props = schema.properties(node);
    for (const pair of map.pairs) {
      const value = pair.value;
      if (value === undefined || (value.kind === 'scalar' && value.value === null)) continue;
      const at = path === '' ? pair.key : `${path}.${pair.key}`;
      const child = props.get(pair.key);
      if (child === undefined) {
        if (path === '' && pair.key === ownSection) continue;
        const hint = closest(pair.key, liveKeys(props));
        out.push({
          severity: 'warning',
          code: 'CONFIG_UNKNOWN_KEY',
          message: `Unknown config key "${at}"; ignored.${hint === undefined ? '' : ` Did you mean "${hint}"?`}`,
          range: pair.keyRange,
        });
        continue;
      }
      const note = annotationOf(schema.resolve(child));
      if (note.status === 'removed' || note.status === 'moved') {
        const moved = note.status === 'moved';
        out.push({
          severity: 'warning',
          code: moved ? 'CONFIG_MOVED_KEY' : 'CONFIG_REMOVED_KEY',
          message: [
            moved
              ? `Config key "${at}" moved to ${note.movedTo ?? 'another package'}.`
              : `Config key "${at}" was removed in ${note.since ?? 'v13'} and has no effect.`,
            note.reason,
            note.replacement === undefined ? undefined : `Replacement: ${note.replacement}.`,
          ]
            .filter((s) => s !== undefined)
            .join(' '),
          range: pair.keyRange,
        });
        continue;
      }
      if (value.kind === 'map' && schema.shape(child) === 'closed') walk(value, child, at);
    }
  };
  walk(config, schema.root, '');
  return out;
}
