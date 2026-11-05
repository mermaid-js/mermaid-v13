/**
 * Front matter in the service (DESIGN §4.5, R-LANG-5, D96): the YAML node tree of the front
 * matter (the reader's tree mode, which keeps reading after an error) and its YAML errors, one
 * per bad line (#168), the key under an offset, and the config warnings of `config:`. The warnings are core's own (`resolveText`,
 * as a render resolves the front matter), placed on the keys they name. `%%{init}%%`
 * directives keep their preprocess diagnostics only.
 */
import { CORE_DEFAULTS, resolveSite, resolveText } from '@mermaid-js/core/config';
import type { ConfigWarning, ResolvedSite } from '@mermaid-js/core/config';
import type { Diagnostic, Range } from '@mermaid-js/core/parser-kit';
import { parseYaml } from '@mermaid-js/core/preprocess';
import type { YamlMapNode, YamlNode, YamlPair } from '@mermaid-js/core/preprocess';
import type { DocumentContext } from '../context.ts';
import { firstPartyFacets } from '../generated/facets.gen.ts';
import { SchemaView, annotationOf } from './schema.ts';
import type { SchemaNode } from './schema.ts';

/** The front matter of one snapshot, read once. */
export interface FrontMatterTree {
  /** The whole block, fences included; an unclosed one runs to the end of the text. */
  readonly range: Range;
  /** The YAML between the fences (to the end of the text when unclosed). */
  readonly yamlRange: Range;
  /** The fence's indent, which every YAML line shares. */
  readonly indent: number;
  /** No closing fence: the block runs to the end of the text, as preprocess reads it. */
  readonly unclosed: boolean;
  /** The document's root node; `null` when nothing could be read. */
  readonly root: YamlNode | null;
  /**
   * The tree mode's YAML diagnostics (#168): one per bad line, where preprocess (and so the
   * renderer, D91) stops at the first. Empty for an unclosed block, which preprocess does not
   * read as YAML.
   */
  readonly diagnostics: readonly Diagnostic[];
}

/** Where an unclosed front matter opens (preprocess reports it, with the opener as related). */
function unclosedOpener(ctx: DocumentContext): number | undefined {
  const d = ctx.pre.diagnostics.find((x) => x.code === 'UNCLOSED_FRONT_MATTER');
  return d?.related?.[0]?.range.start;
}

export function frontMatterTree(ctx: DocumentContext): FrontMatterTree | undefined {
  const { text } = ctx;
  const fm = ctx.pre.frontMatter;
  let range: Range;
  let yamlRange: Range;
  let dash: number;
  if (fm === undefined) {
    const opener = unclosedOpener(ctx);
    if (opener === undefined) return undefined;
    dash = opener;
    const lineStart = text.lastIndexOf('\n', dash - 1) + 1;
    const nl = text.indexOf('\n', dash);
    const yamlStart = nl < 0 ? text.length : nl + 1;
    range = { start: lineStart, end: text.length };
    yamlRange = { start: yamlStart, end: text.length };
  } else {
    range = fm.range;
    yamlRange = fm.yamlRange;
    dash = text.indexOf('---', fm.range.start);
  }
  const indent = text.slice(range.start, dash);
  const read = parseYaml(text, { start: yamlRange.start, end: yamlRange.end, indent, tree: true });
  return {
    range,
    yamlRange,
    indent: indent.length,
    unclosed: fm === undefined,
    root: read.root,
    diagnostics: fm === undefined ? [] : read.diagnostics,
  };
}

/**
 * The config section the renderer resolves this type's config with (mermaid's `sectionOf`:
 * the plugin id): a first-party row's generated `section` (none for a type with no v13
 * package), a third-party row's id.
 */
export function configSection(ctx: DocumentContext): string | undefined {
  const entry = ctx.entry;
  if (entry === undefined) return undefined;
  return firstPartyFacets.includes(entry) ? entry.section : entry.id;
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
  let prev = new Uint16Array(b.length + 1).map((_, j) => j);
  let row = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    row[0] = i;
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      const v = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
      row[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    [prev, row] = [row, prev];
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

/** Keys diagram text cannot set: core's integrator-only and secure keys (R-SEC-5, R-SEC-6). */
export function secureKeys(): ReadonlySet<string> {
  return siteFor(undefined).secure;
}

/** Sites by section: content-keyed, and frozen by core. */
const sites = new Map<string, ResolvedSite>();

/** The integrator side a render starts from, with no `initialize()`: core defaults, and the
 * section (a third-party one is open, as its plugin's defaults make it in a render). */
function siteFor(section: string | undefined): ResolvedSite {
  const key = section ?? '';
  let site = sites.get(key);
  if (site === undefined) {
    site = resolveSite(CORE_DEFAULTS, undefined, section ? { [section]: {} } : {}, { section });
    sites.set(key, site);
  }
  return site;
}

/** Each mapping's first pair per key, built once per mapping (linear in its pairs). */
const pairIndex = new WeakMap<YamlMapNode, Map<string, YamlPair>>();
function pairOf(node: YamlMapNode, key: string): YamlPair | undefined {
  let index = pairIndex.get(node);
  if (index === undefined) {
    index = new Map();
    for (const p of node.pairs) if (!index.has(p.key)) index.set(p.key, p);
    pairIndex.set(node, index);
  }
  return index.get(key);
}

/** The key (or list item) a warning path names, under `node`, and the keys on the way. */
function locate(
  node: YamlNode | undefined,
  segments: readonly string[]
): { range: Range; keys: string[] } | undefined {
  if (node === undefined || segments.length === 0) return undefined;
  if (node.kind === 'seq') {
    const item = node.items[Number(segments[0])];
    if (!/^\d+$/.test(segments[0]!) || item === undefined) return undefined;
    if (segments.length === 1) return { range: item.range, keys: [] };
    return locate(item, segments.slice(1));
  }
  if (node.kind !== 'map') return undefined;
  // A key may hold dots itself: try the longest one first.
  for (let n = segments.length; n > 0; n--) {
    const key = segments.slice(0, n).join('.');
    const pair = pairOf(node, key);
    if (pair === undefined) continue;
    if (n === segments.length) return { range: pair.keyRange, keys: [key] };
    const inner = locate(pair.value, segments.slice(n));
    if (inner !== undefined) return { range: inner.range, keys: [key, ...inner.keys] };
  }
  return undefined;
}

/**
 * The config warnings a render gives for this front matter (core `resolveText`: unknown,
 * removed, moved and secure keys, `look`, unsafe values), each on the key it names, an
 * unknown one with a "did you mean" among the keys diagram text can set. None for an
 * unclosed front matter or YAML with errors, which a render reads no config from.
 */
export function configDiagnostics(
  ctx: DocumentContext,
  fm: FrontMatterTree | undefined
): Diagnostic[] {
  // The config the render reads: none from YAML with errors (those errors are shown instead).
  const config = fm === undefined || fm.unclosed ? undefined : ctx.pre.frontMatter?.config;
  if (fm === undefined || config === undefined) return [];
  const site = siteFor(configSection(ctx));
  const warnings: ConfigWarning[] = [];
  resolveText(site, config, [], { warn: (w) => warnings.push(w) });
  const configPair =
    fm.root?.kind === 'map' ? fm.root.pairs.find((p) => p.key === 'config') : undefined;
  const fallback = configPair?.keyRange ?? fm.yamlRange;
  const schema = ctx.schema === undefined ? undefined : new SchemaView(ctx.schema);
  // The keys a hint may name, per parent path: settable keys only (not secure, not `look`).
  const knownAt = new Map<string, string[]>();
  const known = (keys: readonly string[]): string[] => {
    const at = keys.join('\0');
    let list = knownAt.get(at);
    if (list === undefined) {
      const parent = schema?.at(keys);
      list =
        parent === undefined || schema === undefined
          ? []
          : liveKeys(schema.properties(parent)).filter(
              (k) => k !== 'look' && !(keys.length === 0 && site.secure.has(k))
            );
      knownAt.set(at, list);
    }
    return list;
  };
  const out = warnings.map((w): Diagnostic => {
    const hit = locate(configPair?.value, w.path.split('.'));
    let message = w.message;
    if (w.code === 'CONFIG_UNKNOWN_KEY' && hit !== undefined) {
      const hint = closest(hit.keys.at(-1)!, known(hit.keys.slice(0, -1)));
      if (hint !== undefined) message += ` Did you mean "${hint}"?`;
    }
    return { severity: 'warning', code: w.code, message, range: hit?.range ?? fallback };
  });
  // Source order, for the merge with the other diagnostics.
  return out.sort((a, b) => a.range.start - b.range.start);
}
