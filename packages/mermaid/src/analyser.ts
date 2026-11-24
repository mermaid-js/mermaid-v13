/**
 * The analyser of one API object (DESIGN §3 steps 1–4): detect, site config, parse, and the
 * cache of what they made. Every registration drops the cache through `invalidate()`, the one
 * place it is cleared from.
 */
import {
  errorFromDiagnostics,
  UnsupportedFormatError,
  type DiagramParseContext,
  type Warning,
} from '@mermaid-js/core';
import { resolveText, type ResolvedConfig } from '@mermaid-js/core/config';
import type { Diagnostic } from '@mermaid-js/core/parser-kit';
import { checkSource } from '@mermaid-js/core/limits';
import { preprocess, type PreprocessResult } from '@mermaid-js/core/preprocess';
import { stageEnd, stageStart } from '@mermaid-js/core/timing';
import {
  AnalysisCache,
  dataAstOf,
  fullParse,
  parseStep,
  type Analysis,
  type Detection,
  type Parsed,
} from './analysis-cache.ts';
import {
  directiveConfig,
  textConfig,
  type SiteConfigs,
  type Snapshot,
  type TextConfigs,
} from './config-snapshot.ts';
import type { BlockHost } from './embeds.ts';
import { toWarning, unsupportedDiagram } from './errors.ts';
import type { AnyPlugin, Detected, Registry } from './registry.ts';
import { outsideBlocks } from './embeds.ts';

/** What `detect` found, for a type with a plugin package. */
export interface Found {
  readonly detected: Detected & { readonly id: string };
  readonly pre: PreprocessResult;
}

/** A type may read its own section on top of its plugin's (`swimlane` over `flowchart`, D534). */
export function sectionOf(detected: Detected, plugin?: AnyPlugin): string | string[] | undefined {
  const own = plugin?.configSection ?? plugin?.id ?? detected.id;
  return detected.section && detected.section !== own ? [detected.section, own!] : own;
}

/** Hands the warnings among `diagnostics` to `warn`. */
function warnOf(diagnostics: readonly Diagnostic[], warn: (w: Warning) => void): void {
  for (const d of diagnostics) if (d.severity === 'warning') warn(d);
}

export class Analyser {
  /** The analyses of recent texts, each valid only for the snapshot it was made with. */
  readonly cache = new AnalysisCache<Analysis>();
  /** The configs of recent diagram-text configs, by value, over each site config. */
  private texts: TextConfigs = new WeakMap();

  /**
   * `claims`: what the registered extensions claim of a parse, read at each parse because the
   * hooks are rebuilt after a registration. `readsAst`: whether a `postParse` hook of a render
   * of `plugin` with `config` reads the AST, so its parse is full (DESIGN §4.2).
   */
  constructor(
    private readonly registry: Registry,
    private readonly siteConfigs: SiteConfigs,
    private readonly claims: () => readonly string[],
    private readonly readsAst: (plugin: AnyPlugin, config: ResolvedConfig) => boolean
  ) {}

  /** Drops every parsed text: a registration changes how texts detect, resolve and parse. */
  invalidate(): void {
    this.cache.clear();
    this.texts = new WeakMap();
  }

  /** The author's config layers and the config they resolve to, over the site's and a host's. */
  private layers(
    pre: PreprocessResult,
    snap: Snapshot,
    plugin: AnyPlugin,
    detected: Detected,
    warn: (w: Warning) => void,
    host?: BlockHost
  ) {
    const section = sectionOf(detected, plugin);
    let front = pre.frontMatter?.config;
    let directives = directiveConfig(pre, section);
    const hit = this.siteConfigs.get(snap, plugin, detected, section, this.registry.fragments());
    for (const w of hit.warnings) warn(w);
    // An embedded diagram (ADR-15) sets only its own options, with one warning for the rest.
    if (host) ({ front, directives } = host.layers(front, directives, hit.site, warn));
    // An embedded diagram starts from its host's config, and takes its theme.
    let config: ResolvedConfig = host
      ? resolveText(hit.site, front, directives, { warn, under: host.config })
      : textConfig(this.texts, hit, front, directives, warn);
    if (host) config = host.resolve(config, [section ?? []].flat());
    return { config, sources: [hit.site.site, front, ...directives] };
  }

  /**
   * Detect, resolve config and parse with a loaded plugin (DESIGN §3 steps 1–4). The parse is
   * lean (DESIGN §4.2) unless the call asks for it `full` or a `postParse` hook of the render
   * reads the AST; a lean parse with an error is parsed again in full for its diagnostics.
   */
  analyse(
    text: string,
    snap: Snapshot,
    plugin: AnyPlugin,
    { detected, pre }: Detection,
    host?: BlockHost,
    full = false
  ): Parsed {
    const warnings: Warning[] = [];
    const warn = (w: Warning): void => void warnings.push(toWarning(w, this.registry.fragments()));
    warnOf(pre.diagnostics, warn);
    const { config, sources } = this.layers(pre, snap, plugin, detected, warn, host);
    const t = stageStart();
    const claims = this.claims();
    const ctx: DiagramParseContext =
      claims.length > 0
        ? { config, preprocessed: pre, limits: snap.limits, claims }
        : { config, preprocessed: pre, limits: snap.limits };
    const readsAst = this.readsAst(plugin, config);
    const dataAst = dataAstOf(snap.options, plugin, readsAst);
    const parsed = parseStep(plugin, text, ctx, !full && !readsAst, dataAst);
    const parse = parsed.lean;
    stageEnd('parse', t);
    // A directive inside a block belongs to the block (ADR-15): parse again without it.
    const outside = outsideBlocks(pre, parse);
    if (outside !== pre)
      return this.analyse(text, snap, plugin, { detected, pre: outside }, host, full);
    const error = errorFromDiagnostics(text, [...pre.diagnostics, ...parse.diagnostics]);
    if (error) throw error;
    warnOf(parse.diagnostics, warn);
    const title = pre.frontMatter?.title;
    const analysis: Analysis = {
      detected,
      plugin,
      prepared: { diagramType: detected.type, config, parse, warnings },
      ...(title !== undefined ? { title } : {}),
      sources,
      dataAst,
      full: () => fullParse(plugin, text, ctx),
    };
    return { analysis, full: parsed.full };
  }

  detect(text: string, s: Snapshot): Detection {
    // DESIGN §3 step 1: the source limit, before the text is read at all.
    checkSource(text, s.limits);
    const pre = preprocess(text);
    const error = errorFromDiagnostics(
      text,
      pre.diagnostics.filter((d) => d.severity === 'error')
    );
    if (error) throw error;
    return {
      detected: this.registry.detect(text, pre, s.config as Readonly<Record<string, unknown>>),
      pre,
    };
  }

  /**
   * Whether `a`'s type has text output (R-ASCII-5, D80). Asked by type: a type can draw fewer
   * formats than its plugin (`typeOptions` `formats`).
   */
  textOf(a: { detected: Detected }): boolean {
    return a.detected.id !== undefined && this.registry.formats(a.detected.type).includes('ascii');
  }

  /** Throws `UnsupportedFormatError` unless `detected` declares ascii (R-ASCII-5, D80). */
  checkText(detected: Detected): void {
    if (!this.textOf({ detected })) throw new UnsupportedFormatError(detected.type, 'ascii');
  }

  /** `detect`, for a type with a plugin package that can draw `ascii` when that is asked for. */
  detectSupported(text: string, s: Snapshot, ascii: boolean): Found {
    const { detected, pre } = this.detect(text, s);
    if (detected.id === undefined) throw unsupportedDiagram(detected.type);
    if (ascii) this.checkText(detected);
    return { detected: { ...detected, id: detected.id }, pre };
  }

  /**
   * Parses with the loaded `plugin` and caches the analysis (DESIGN §3 steps 2–4): only its
   * lean parse; a full parse goes to the call that asked for it.
   */
  analysisOf(
    text: string,
    s: Snapshot,
    found: Found,
    plugin: AnyPlugin | undefined,
    full = false
  ): Parsed {
    if (!plugin) throw unsupportedDiagram(found.detected.type);
    const parsed = this.analyse(text, s, plugin, found, undefined, full);
    this.cache.set(text, s, parsed.analysis);
    return parsed;
  }
}
