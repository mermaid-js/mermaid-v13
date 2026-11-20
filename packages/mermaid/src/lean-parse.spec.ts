/**
 * Lean parses (DESIGN §4.2, R-PARSE-3, R-PARSE-8): what the API asks a diagram plugin for, what
 * it keeps of the result, and when the drawing writes `data-ast`. `lean` honours `ctx.lean` and
 * says so with `leanParse`; `full` ignores it, as a plugin written before lean parses does.
 */
import { describe, expect, it } from 'vitest';
import type { DiagramPlugin, ExtensionPlugin, RenderContext } from '@mermaid-js/core';
import {
  NO_AST_ID,
  type AstNode,
  type Diagnostic,
  type ParseOutput,
} from '@mermaid-js/core/parser-kit';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { createMermaid, MermaidError } from './index.ts';
import type { InitializeConfig } from './api.ts';

interface Model {
  readonly ast: string;
}

const R = { start: 0, end: 1 };
const diagnostic = (severity: 'error' | 'warning', code: string): Diagnostic => ({
  severity,
  code,
  message: `${code} here.`,
  range: R,
});

/** A stub type `id`: a node `A` with `data-ast`; a text with `bad` has one error, or two in full. */
function stub(id: string, honours: boolean) {
  const calls: { lean: boolean; astIds: boolean | undefined }[] = [];
  const plugin: DiagramPlugin<Model, undefined> = {
    id,
    layoutKind: 'custom',
    ...(honours ? { leanParse: true } : {}),
    detector: (text) => text.startsWith(id),
    parse: (text, ctx) => {
      calls.push({ lean: ctx.lean === true, astIds: ctx.astIds });
      const lean = honours && ctx.lean === true;
      const bad = text.includes('bad');
      const errors = bad ? [diagnostic('error', 'E1'), diagnostic('error', 'E2')] : [];
      // A lean parse may stop at its first error.
      const diagnostics = [diagnostic('warning', 'W'), ...(lean ? errors.slice(0, 1) : errors)];
      if (lean) return { lean: true, model: { ast: ctx.astIds ? 'n:A' : NO_AST_ID }, diagnostics };
      const ast: AstNode = { id: 'doc', type: 'Document', range: R };
      return { model: { ast: 'n:A' }, ast, diagnostics, symbols: [], statements: [] };
    },
    render: (model: Model, _l: undefined, ctx: RenderContext, w: SvgWriter) => {
      w.open('svg', {
        xmlns: 'http://www.w3.org/2000/svg',
        id: ctx.idPrefix,
        viewBox: [0, 0, 10, 10],
      });
      w.leaf('g', { class: 'node', 'data-id': 'A', 'data-ast': model.ast });
      w.close();
    },
  };
  return { plugin, calls };
}

async function api(config: InitializeConfig = {}, extensions: ExtensionPlugin[] = []) {
  const lean = stub('lean', true);
  const full = stub('full', false);
  const m = createMermaid();
  m.initialize(config);
  await m.registerExternalDiagrams([lean.plugin, full.plugin, ...extensions]);
  return { m, lean, full };
}

const AST_ATTR = /data-ast="n:A"/;
const leanCall = (astIds: boolean) => ({ lean: true, astIds });
const fullCall = { lean: false, astIds: undefined };

describe('lean parses for a draw (DESIGN §4.2)', () => {
  it('asks for a lean parse, without ids, and draws no data-ast by default', async () => {
    const { m, lean } = await api();
    const r = await m.render('x', 'lean');
    expect(lean.calls).toEqual([leanCall(false)]);
    expect(r.svg).toContain('data-id="A"');
    expect(r.svg).not.toContain('data-ast');
    expect(r.warnings.map((w) => w.code)).toEqual(['W']);
  });

  it('asks for the ids and draws data-ast when the integrator turns it on', async () => {
    const { m, lean } = await api({ output: { dataAst: true } });
    expect((await m.render('x', 'lean')).svg).toMatch(AST_ATTR);
    expect(lean.calls).toEqual([leanCall(true)]);
  });

  it('keeps data-ast for a plugin that does not parse lean, unless the integrator turns it off', async () => {
    const on = await api();
    expect((await on.m.render('x', 'full')).svg).toMatch(AST_ATTR);
    expect(on.full.calls).toEqual([leanCall(true)]);
    const off = await api({ output: { dataAst: false } });
    expect((await off.m.render('x', 'full')).svg).not.toContain('data-ast');
  });

  it('caches only the lean view of a full result, for what reads the parse later', async () => {
    const seen: ParseOutput<unknown>[] = [];
    const probe: ExtensionPlugin = {
      id: 'probe',
      resources: { provides: [], missing: (p) => (seen.push(p), []), load: async () => {} },
    };
    const { m, full } = await api({}, [probe]);
    await m.render('x', 'full');
    m.renderSync('full');
    expect(full.calls).toHaveLength(1);
    expect(seen.length).toBeGreaterThan(1);
    for (const p of seen) {
      expect(p).toMatchObject({ lean: true, model: { ast: 'n:A' } });
      for (const key of ['ast', 'symbols', 'statements']) expect(key in p, key).toBe(false);
    }
  });

  it('parses lean for parse(), which returns no AST', async () => {
    const { m, lean } = await api();
    expect((await m.parse('lean')).warnings.map((w) => w.code)).toEqual(['W']);
    await m.render('x', 'lean');
    expect(lean.calls).toEqual([leanCall(false)]);
  });
});

describe('full parses', () => {
  it('hands prepare() a full parse on every call, and draws after it without parsing', async () => {
    const { m, lean } = await api();
    const first = await m.prepare('lean');
    expect(first.parse.ast.id).toBe('doc');
    m.renderSync('lean');
    expect(lean.calls).toEqual([fullCall]);
    const again = await m.prepare('lean');
    expect(again.parse.ast).not.toBe(first.parse.ast);
    expect(again.config).toBe(first.config);
    expect(lean.calls).toEqual([fullCall, fullCall]);
  });

  it('parses in full for a postParse hook, on every draw, and then draws data-ast', async () => {
    const asts: AstNode[] = [];
    const hook: ExtensionPlugin = { id: 'hook', postParse: (ast) => (asts.push(ast), ast) };
    const { m, lean } = await api({}, [hook]);
    expect((await m.render('x', 'lean')).svg).toMatch(AST_ATTR);
    expect(m.renderSync('lean').svg).toMatch(AST_ATTR);
    expect(asts.map((a) => a.id)).toEqual(['doc', 'doc']);
    expect(lean.calls).toEqual([fullCall, fullCall]);
  });

  it('parses lean for an extension without postParse, and draws no data-ast for it', async () => {
    const mount: ExtensionPlugin = { id: 'mount', afterMount: () => {}, postRender: () => {} };
    const { m, lean } = await api({}, [mount]);
    expect((await m.render('x', 'lean')).svg).not.toContain('data-ast');
    expect(lean.calls).toEqual([leanCall(false)]);
  });

  it('lets the integrator turn data-ast off for a postParse hook, which still gets the AST', async () => {
    const asts: AstNode[] = [];
    const hook: ExtensionPlugin = { id: 'hook', postParse: (ast) => (asts.push(ast), ast) };
    const { m } = await api({ output: { dataAst: false } }, [hook]);
    expect((await m.render('x', 'lean')).svg).not.toContain('data-ast');
    expect(asts).toHaveLength(1);
  });

  it('parses an error again in full and throws what the full parse reports', async () => {
    const { m, lean } = await api();
    const error = await m.render('x', 'lean bad').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MermaidError);
    const codes = (error as MermaidError).diagnostics.map((d) => d.code);
    expect(codes).toEqual(['E1', 'E2']);
    expect((error as MermaidError).message).toContain('(1 more error)');
    expect(lean.calls).toEqual([leanCall(false), fullCall]);
  });

  it('refuses a lean parse the plugin was not asked for', async () => {
    const odd: DiagramPlugin<Model, undefined> = {
      ...stub('odd', true).plugin,
      parse: () => ({ lean: true, model: { ast: NO_AST_ID }, diagnostics: [] }),
    };
    const m = createMermaid();
    await m.registerExternalDiagrams([odd]);
    await expect(m.prepare('odd')).rejects.toMatchObject({ code: 'INTERNAL' });
  });
});
