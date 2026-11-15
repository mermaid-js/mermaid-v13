import { describe, expect, it } from 'vitest';
import type { DiagramPlugin } from '@mermaid-js/core';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createMermaid, MermaidError } from './index.ts';
import type { InitializeConfig } from './api.ts';

const FLOW = 'flowchart LR\n  A --> B';
const TITLED = 'flowchart LR\n  accTitle: T\n  A --> B';
const ids = (svg: string) => [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);

describe('per-call config snapshots', () => {
  it('follows what a reused config object holds, not its identity', async () => {
    const m = createMermaid();
    const config: InitializeConfig = { theme: 'dark' };
    await m.prepare(FLOW, { config });
    const dark = m.renderSync(FLOW, { config }).svg;
    config.theme = 'forest';
    await m.prepare(FLOW, { config });
    const changed = m.renderSync(FLOW, { config }).svg;
    await m.prepare(FLOW, { config: { theme: 'forest' } });
    expect(changed).not.toBe(dark);
    expect(changed).toBe(m.renderSync(FLOW, { config: { theme: 'forest' } }).svg);
  });

  it('lets an equal fresh config object reuse the analysis from prepare()', async () => {
    const m = createMermaid();
    const prepared = await m.prepare(FLOW, { config: { theme: 'dark' } });
    // Each prepare() hands out its own full parse; the cached analysis it comes from is shared.
    expect((await m.prepare(FLOW, { config: { theme: 'dark' } })).config).toBe(prepared.config);
  });
});

describe('id prefix determinism (R-ARCH-6)', () => {
  // A measurer that keeps its own cache as plain data, as real measurers do.
  const caching = (): Measurer & { seen: Record<string, number> } => {
    const seen: Record<string, number> = {};
    return {
      id: 'caching',
      seen,
      width(text, font, style) {
        return (seen[text] = tableMeasurer.width(text, font, style));
      },
      metrics: (font) => tableMeasurer.metrics(font),
    };
  };

  it('keys the prefix on the measurer id, not on its state', async () => {
    const measurer = caching();
    const m = createMermaid();
    m.initialize({ measurer });
    await m.prepare(TITLED);
    const first = ids(m.renderSync(TITLED).svg);
    await m.render('other', 'flowchart LR\n  X[Some other words] --> Y');
    expect(Object.keys(measurer.seen).length).toBeGreaterThan(0);
    expect(ids(m.renderSync(TITLED).svg)).toEqual(first);
  });

  it('renders with a measurer that refers to itself', async () => {
    const measurer = caching() as ReturnType<typeof caching> & { self?: unknown };
    measurer.self = measurer;
    const m = createMermaid();
    m.initialize({ measurer });
    await m.prepare(TITLED);
    expect(ids(m.renderSync(TITLED).svg)[0]).toMatch(/^mermaid-[0-9a-z]+-title$/);
  });
});

describe('integrator values stay the integrator’s', () => {
  it('does not freeze arrays passed to initialize()', () => {
    const secure = ['theme'];
    createMermaid().initialize({ secure });
    expect(Object.isFrozen(secure)).toBe(false);
    secure.push('fontFamily');
    expect(secure).toEqual(['theme', 'fontFamily']);
  });
});

describe('formats (D80)', () => {
  it('rejects an unsupported format in prepare() as renderSync() does', async () => {
    const m = createMermaid();
    const options = { format: 'png' } as never;
    const error = await m.prepare(FLOW, options).then(
      () => undefined,
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(MermaidError);
    expect((error as MermaidError).code).toBe('UNSUPPORTED_FORMAT');
  });
});

describe('text output context', () => {
  it('freezes the ascii section the text entry reads', async () => {
    const m = createMermaid();
    let seen: unknown;
    await m.registerExternalDiagrams([
      {
        id: 'probe',
        postParse(ast, ctx) {
          seen = (ctx.config as { ascii?: unknown }).ascii;
          return ast;
        },
      },
    ]);
    await m.prepare(FLOW, { format: 'ascii' });
    m.renderSync(FLOW, { format: 'ascii' });
    expect(typeof (seen as { charset?: unknown } | undefined)?.charset).toBe('string');
    expect(Object.isFrozen(seen)).toBe(true);
  });
});

describe('the parse cache', () => {
  it('keeps what parse() found, so render() right after does not parse again', async () => {
    let parses = 0;
    const counted: DiagramPlugin = {
      id: 'counted',
      layoutKind: 'custom',
      detector: (text) => /^\s*counted/.test(text),
      parse: () => {
        parses++;
        return { model: {}, diagnostics: [] } as never;
      },
      render: () => undefined as never,
    };
    const m = createMermaid();
    await m.registerExternalDiagrams([counted]);
    await m.parse('counted\n  a');
    await m.render('c', 'counted\n  a');
    expect(parses).toBe(1);
  });
});
