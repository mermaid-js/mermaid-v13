/**
 * The async side of one API object (DESIGN §3): `prepare`, `parse` and `preload` load what a
 * text needs, so the synchronous draw in `draw.ts` finds it ready.
 */
import { MermaidError, UnsupportedFormatError } from '@mermaid-js/core';
import { INTEGRATOR_ONLY_KEYS } from '@mermaid-js/core/config';
import { loadTheme, resolveThemeName } from '@mermaid-js/core/theme';
import type { Analysis } from './analysis-cache.ts';
import { sectionOf } from './analyser.ts';
import type { ParseOptions, ParseResult12, PreloadRequest } from './api-types.ts';
import { directiveConfig, mergeInto, type Plain, type Snapshot } from './config-snapshot.ts';
import { loadFor } from './draw-context.ts';
import { outsideBlocks } from './embeds.ts';
import { toMermaidError } from './errors.ts';
import type { Session } from './session.ts';

/** Loads the ascii entry and the text backend (D76, D80): only for `format: 'ascii'`. */
export async function loadText(k: Session, a: Analysis): Promise<void> {
  k.analyser.checkText(a.detected);
  const [hook, backend] = await Promise.all([
    k.registry.loadAscii(a.plugin.id),
    k.textBackend ?? import('./ascii.ts'),
  ]);
  k.textBackend = backend;
  if (!hook) throw new UnsupportedFormatError(a.detected.type, 'ascii');
}

/** `svg` or `ascii`; anything else is an `UnsupportedFormatError` in both phases (D80). */
export function checkFormat(k: Session, text: string, s: Snapshot, f = 'svg'): 'svg' | 'ascii' {
  if (f === 'svg' || f === 'ascii') return f;
  let type = 'unknown';
  try {
    type = k.analyser.detect(text, s).detected.type;
  } catch {
    // The format error wins over whatever else is wrong with the text.
  }
  throw new UnsupportedFormatError(type, f);
}

export async function prepareWith(
  k: Session,
  text: string,
  s: Snapshot,
  format?: string
): Promise<Analysis> {
  const { analyser, registry } = k;
  if (k.discovery.pending) await k.discovery.settle();
  const ascii = checkFormat(k, text, s, format) === 'ascii';
  let analysis = analyser.cache.get(text, s);
  if (!analysis) {
    const f = analyser.detectSupported(text, s, ascii);
    analysis = analyser.analysisOf(text, s, f, await registry.load(f.detected.id));
  }
  if (ascii) await loadText(k, analysis);
  await (
    await k.blocks.load(analysis)
  )?.prepare({ root: text, at: 0, a: analysis, s }, ascii ? 'ascii' : 'svg');
  await loadFor(k, analysis, ascii);
  return analysis;
}

export async function parseText(
  k: Session,
  text: string,
  parseOptions?: ParseOptions
): Promise<ParseResult12 | false> {
  const { analyser } = k;
  if (k.discovery.pending) await k.discovery.settle();
  const s = k.site;
  try {
    const f = analyser.detectSupported(text, s, false);
    const { detected, pre } = f;
    const plugin = await k.registry.load(detected.id);
    const a = analyser.cache.get(text, s) ?? analyser.analysisOf(text, s, f, plugin);
    await (await k.blocks.load(a))?.prepare({ root: text, at: 0, a, s }, undefined);
    const config: Plain = {};
    const front = pre.frontMatter?.config;
    for (const c of [
      ...(front ? [front] : []),
      ...directiveConfig(outsideBlocks(pre, a.prepared.parse), sectionOf(detected, plugin)),
    ])
      mergeInto(config, c as Plain);
    for (const key of INTEGRATOR_ONLY_KEYS) delete config[key];
    return {
      diagramType: a.prepared.diagramType,
      config: config as ParseResult12['config'],
      warnings: [...a.prepared.warnings],
    };
  } catch (e) {
    if (parseOptions?.suppressErrors) return false;
    const error = toMermaidError(e);
    k.parseErrorHandler?.(error);
    throw error;
  }
}

/** The loads one type of a `preload` request: plugin, its layout and part, and ascii. */
function loadType(k: Session, tasks: Promise<unknown>[], t: string, ascii: boolean | undefined) {
  const { registry } = k;
  tasks.push(
    registry.load(t).then((p) => {
      if (!p)
        throw new MermaidError('UNSUPPORTED_DIAGRAM', `Diagram type "${t}" is not supported.`);
      // The plugin's own default engine (D284), or the type's (D534), comes with it.
      const layout = registry.layoutOf(t) ?? p.layoutEngine?.default;
      return Promise.all(
        [layout, registry.layoutPart(p, layout!)[0]].map((n) => n && registry.loadLayout(n))
      );
    })
  );
  if (ascii)
    tasks.push(
      registry.loadAscii(t).then((hook) => {
        if (!hook) throw new UnsupportedFormatError(t, 'ascii');
      })
    );
}

/** The theme loads of a `preload` request: `auto` needs its dark spec too. */
function loadThemes(tasks: Promise<unknown>[], names: readonly string[]): void {
  for (const name of names) {
    const choice = resolveThemeName(name);
    tasks.push(loadTheme(choice.name));
    if (choice.dark) tasks.push(loadTheme(choice.dark));
  }
}

export async function preload(k: Session, req: PreloadRequest): Promise<void> {
  const { registry } = k;
  if (k.discovery.pending) await k.discovery.settle();
  const tasks: Promise<unknown>[] = [];
  const ascii = req.formats?.includes('ascii');
  if (ascii) tasks.push(import('./ascii.ts').then((b) => void (k.textBackend = b)));
  for (const t of req.types ?? []) loadType(k, tasks, t, ascii);
  for (const l of req.layouts ?? []) tasks.push(registry.loadLayout(l));
  loadThemes(tasks, req.themes ?? []);
  // Extensions' resources by kind: `math: true` loads what a math extension provides (D178).
  if (req.math) for (const n of k.hooks.provided('math')) tasks.push(n.load());
  for (const name of req.iconPacks ?? []) tasks.push(k.iconPacks.load(name));
  try {
    await Promise.all(tasks);
  } catch (e) {
    throw toMermaidError(e);
  }
}
