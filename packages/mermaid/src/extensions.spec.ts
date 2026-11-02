import { describe, expect, it } from 'vitest';
import type { LaidOut } from '@mermaid-js/core';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import {
  assertInert,
  checkUrl,
  type SafeUrl,
  type StyleText,
  type SvgTree,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import {
  createMermaid,
  MermaidError,
  readManifest,
  type ExtensionPlugin,
  type ExternalDiagram,
  type RenderResult,
} from './index.ts';

const FLOW = 'flowchart LR\n  A[Start] --> B(End)\n';

async function rejection(p: Promise<unknown>): Promise<MermaidError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(MermaidError);
    return e as MermaidError;
  }
  throw new Error('expected a rejection');
}

/** The fixture extension plugin: records every hook call and leaves a mark on the output. */
function recorder(id: string, log: string[]): ExtensionPlugin {
  return {
    id,
    postParse(ast: AstNode, ctx) {
      log.push(`${id}:postParse:${ast.type}:${ctx.diagram}`);
      return ast;
    },
    postLayout(l: LaidOut, ctx) {
      log.push(`${id}:postLayout:${l.kind}:${l.diagram}:${Object.isFrozen(ctx)}`);
      if (l.kind !== 'graph') return l;
      return { ...l, layout: { ...l.layout, width: l.layout.width + 100 } };
    },
    postRender(tree: SvgTree, ctx) {
      log.push(`${id}:postRender`);
      const [node] = tree.find({ 'data-id': 'A' });
      if (node !== undefined) tree.setAttr(node, 'class', `${tree.getAttr(node, 'class')} ${id}`);
      ctx.warn({ code: 'FIXTURE', message: `${id} ran` });
    },
    afterMount(el: Element, result: RenderResult) {
      log.push(
        `${id}:afterMount:${(el as unknown as { name: string }).name}:${result.diagramType}`
      );
    },
  };
}

describe('extension plugins (R-PLUG-2, D52, D70)', () => {
  it('runs every hook of a registered extension, in registration order', async () => {
    const log: string[] = [];
    const m = createMermaid();
    const plain = await m.render('x', FLOW);
    await m.registerExternalDiagrams([recorder('one', log), recorder('two', log)]);
    const r = await m.render('x', FLOW);

    expect(log).toEqual([
      'one:postParse:Document:flowchart',
      'two:postParse:Document:flowchart',
      'one:postLayout:graph:flowchart:true',
      'two:postLayout:graph:flowchart:true',
      'one:postRender',
      'two:postRender',
    ]);
    // postLayout output reaches the renderer; postRender edits reach the svg.
    expect(r.width).toBe(plain.width + 200);
    expect(r.svg).toContain(' one two"');
    expect(r.warnings.map((w) => w.code)).toEqual(['FIXTURE', 'FIXTURE']);
    assertInert(r.svg);

    // afterMount runs through bindFunctions, the DOM adapter's entry point (§12.2).
    expect(r.bindFunctions).toBeTypeOf('function');
    r.bindFunctions!({ name: 'el' } as unknown as Element);
    expect(log.slice(6)).toEqual([
      'one:afterMount:el:flowchart-v2',
      'two:afterMount:el:flowchart-v2',
    ]);
  });

  it('keeps the plain path when no extension is registered', async () => {
    const r = await createMermaid().render('x', FLOW);
    expect(r.bindFunctions).toBeUndefined();
  });

  it('lets extensions see the AST and pass a per-render state to afterMount', async () => {
    const m = createMermaid();
    const seen: unknown[] = [];
    await m.registerExternalDiagrams([
      {
        id: 'state',
        postParse(ast, ctx) {
          ctx.state.prefix = `${ctx.idPrefix}:${ast.type}`;
          return ast;
        },
        afterMount(_el, _result, state) {
          seen.push(state.prefix);
        },
      },
    ]);
    const a = await m.render('a', 'flowchart LR\n  A --> B\n  B --> C');
    const b = await m.render('b', 'flowchart LR\n  A');
    b.bindFunctions!({} as Element);
    a.bindFunctions!({} as Element);
    expect(seen).toEqual(['b:Document', 'a:Document']);
  });

  it('gives hooks a frozen context, so they cannot change config', async () => {
    const m = createMermaid();
    await m.registerExternalDiagrams([
      {
        id: 'meddler',
        postLayout(l, ctx) {
          (ctx as { idPrefix: string }).idPrefix = 'evil';
          return l;
        },
      },
    ]);
    const e = await rejection(m.render('x', FLOW));
    expect(e.code).toBe('INTERNAL');
    expect(e.message).toContain('Extension "meddler" failed in postLayout');
    expect(Object.isFrozen((await createMermaid().prepare(FLOW)).config)).toBe(true);
  });

  it('rejects a postLayout result whose kind changed (D70)', async () => {
    const m = createMermaid();
    await m.registerExternalDiagrams([
      {
        id: 'shapeshifter',
        postLayout: (l): LaidOut => ({ kind: 'custom', diagram: l.diagram, layout: l.layout }),
      },
    ]);
    const e = await rejection(m.render('x', FLOW));
    expect(e.message).toMatch(/shapeshifter.*postLayout.*kind it was given \("graph"\)/);
  });

  it('hands custom layouts over as kind "custom"; graph-only hooks pass them through', async () => {
    const m = createMermaid();
    const kinds: string[] = [];
    await m.registerExternalDiagrams([
      {
        id: 'bars',
        layoutKind: 'custom' as const,
        detector: (t: string) => t.startsWith('bars'),
        parse: (text: string) => ({
          model: text.length,
          ast: { id: 'bars', type: 'Bars', range: { start: 0, end: text.length } },
          diagnostics: [],
          symbols: [],
          statements: [],
        }),
        layout: (n: number) => ({ columns: n }),
        render: (_m: number, l: { columns: number }, _c: unknown, w: SvgWriter) => {
          w.leaf('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: [0, 0, l.columns, 1] });
        },
      },
      {
        id: 'graph-only',
        postLayout(l) {
          kinds.push(`${l.kind}:${l.diagram}`);
          return l.kind === 'graph' ? { ...l, layout: { ...l.layout, width: 1 } } : l;
        },
      },
    ]);
    const r = await m.render('x', 'bars!');
    expect(kinds).toEqual(['custom:bars']);
    expect(r.width).toBe(5);
  });

  it('claims: callbacks silences the CALLBACK_IGNORED warning', async () => {
    const text = 'flowchart LR\n  A --> B\n  click A callback';
    const plain = await createMermaid().render('x', text);
    expect(plain.warnings.map((w) => w.code)).toContain('CALLBACK_IGNORED');
    const m = createMermaid();
    await m.registerExternalDiagrams([{ id: 'clicks', claims: ['callbacks'] }]);
    expect((await m.render('x', text)).warnings.map((w) => w.code)).not.toContain(
      'CALLBACK_IGNORED'
    );
  });
});

describe('postRender output still passes the allow-list (R-SEC-2)', () => {
  // The tree rejects unknown names itself; branded values are only checked by the re-run.
  const hostile: [string, RegExp, (tree: SvgTree) => void][] = [
    [
      'a <script> element',
      /"hostile" failed in postRender/,
      (t) => void t.append(t.children(t.root)[0]!, 'script' as 'g'),
    ],
    [
      'an on* attribute',
      /"hostile" failed in postRender/,
      (t) => t.setAttr(t.children(t.root)[0]!, 'onclick' as 'class', 'alert(1)'),
    ],
    [
      'a javascript: link',
      /fails the allow-list/,
      (t) => void t.append(t.children(t.root)[0]!, 'a', { href: 'javascript:alert(1)' as SafeUrl }),
    ],
    [
      'a style with a url()',
      /fails the allow-list/,
      (t) => t.setAttr(t.children(t.root)[0]!, 'style', 'fill:url(javascript:x)' as StyleText),
    ],
  ];

  for (const [what, why, edit] of hostile) {
    it(`fails the render when a hook adds ${what}`, async () => {
      const m = createMermaid();
      await m.registerExternalDiagrams([{ id: 'hostile', postRender: edit }]);
      const e = await rejection(m.render('x', FLOW));
      expect(e.code).toBe('INTERNAL');
      expect(e.message).toMatch(why);
    });
  }

  it('accepts a safe link added by a hook', async () => {
    const m = createMermaid();
    await m.registerExternalDiagrams([
      {
        id: 'linker',
        postRender(t) {
          const href = checkUrl('https://example.com/', {});
          t.append(t.children(t.root)[0]!, 'a', { href, target: '_blank' });
        },
      },
    ]);
    const r = await m.render('x', FLOW);
    expect(r.svg).toContain(
      '<a href="https://example.com/" target="_blank" rel="noopener noreferrer"/>'
    );
    assertInert(r.svg);
  });
});

/** The fixture diagram plugin, as its package would ship it: manifest, detector, entry. */
const PIE_MANIFEST = {
  plugin: 'diagram',
  id: 'tinypie',
  formats: ['svg', 'ascii'],
  detector: './dist/detector.js',
  entry: './dist/index.js',
  export: 'tinypie',
};

function tinypie(load: () => void) {
  return {
    manifest: PIE_MANIFEST,
    detector: (text: string) => text.trimStart().startsWith('tinypie'),
    load: async () => {
      load();
      return {
        tinypie: {
          id: 'tinypie',
          layoutKind: 'custom' as const,
          formats: ['svg', 'ascii'] as const,
          detector: () => true,
          parse: (text: string) => ({
            model: text,
            ast: { id: 'p', type: 'Pie', range: { start: 0, end: text.length } },
            diagnostics: [],
            symbols: [],
            statements: [],
          }),
          render: (_m: string, _l: unknown, _c: unknown, w: SvgWriter) =>
            w.leaf('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: [0, 0, 3, 4] }),
        },
      };
    },
  };
}

describe('plugin manifests (R-PLUG-3, DESIGN §12.1)', () => {
  it('registers a diagram by manifest: formats without loading, entry on first use', async () => {
    const m = createMermaid();
    let loads = 0;
    await m.registerExternalDiagrams([tinypie(() => loads++)]);
    expect(m.supportsFormat('tinypie', 'ascii')).toBe(true);
    expect(m.supportsFormat('tinypie', 'svg')).toBe(true);
    expect(m.detectType('tinypie\n  "a": 1')).toBe('tinypie');
    expect(loads).toBe(0);
    const r = await m.render('p', 'tinypie\n  "a": 1');
    expect(r).toMatchObject({ diagramType: 'tinypie', width: 3, height: 4 });
    expect(loads).toBe(1);
  });

  it('loads an extension by manifest on registration (its activation)', async () => {
    const m = createMermaid();
    const log: string[] = [];
    let loads = 0;
    await m.registerExternalDiagrams([
      {
        manifest: { plugin: 'extension', id: 'rec', entry: './dist/index.js' },
        load: async () => {
          loads++;
          return { default: recorder('rec', log) };
        },
      },
    ]);
    expect(loads).toBe(1);
    await m.render('x', FLOW);
    expect(log).toContain('rec:postRender');
  });

  it('refuses manifests that break the contract', async () => {
    const reg = (def: unknown) =>
      createMermaid().registerExternalDiagrams([def as ExternalDiagram]);
    const load = async () => ({ default: { id: 'x' } });
    await expect(
      reg({ manifest: { plugin: 'extension', id: 'x', detector: './d.js' }, load })
    ).rejects.toThrow(/must not have a detector/);
    await expect(reg({ manifest: { plugin: 'theme', id: 'x' }, load })).rejects.toThrow(
      /"plugin" must be "diagram" or "extension"/
    );
    await expect(reg({ manifest: { plugin: 'diagram', id: 'x' }, load })).rejects.toThrow(
      /needs its detector function/
    );
    await expect(reg({ manifest: { plugin: 'extension', id: 'y' }, load })).rejects.toThrow(
      /id "x", its manifest says "y"/
    );
  });

  it('reads manifests: kinds, default formats, unknown formats', () => {
    expect(readManifest({ plugin: 'diagram', id: 'gantt' })).toEqual({
      plugin: 'diagram',
      id: 'gantt',
      formats: ['svg'],
    });
    expect(readManifest({ plugin: 'extension', id: 'interactions', entry: './i.js' })).toEqual({
      plugin: 'extension',
      id: 'interactions',
      entry: './i.js',
    });
    expect(() => readManifest({ plugin: 'diagram', id: 'g', formats: ['png'] })).toThrow(
      /unknown format "png"/
    );
    expect(() => readManifest({ plugin: 'extension', id: 'i', formats: ['svg'] })).toThrow(
      /has no formats/
    );
    expect(() => readManifest('diagram')).toThrow(TypeError);
  });
});
