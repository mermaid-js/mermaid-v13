import { describe, expectTypeOf, it } from 'vitest';
import type * as v12 from 'mermaid-v12';
import * as v13 from 'mermaid';

/**
 * R-COMPAT-5: v12 call sites keep compiling. Each v13 function must be assignable to the
 * v12 declaration (it accepts every v12 argument list and returns what v12 callers read).
 * Checked by `pnpm typecheck`; the runtime assertions are trivial.
 */
type V12 = typeof v12.default;

describe('public API types against the mermaid@12 .d.ts (R-COMPAT-5)', () => {
  it('render(id, text, container?) → Promise<{ svg, diagramType, bindFunctions? }>', () => {
    const render: V12['render'] = v13.render;
    expectTypeOf(render).toBeFunction();
    expectTypeOf<Awaited<ReturnType<typeof v13.render>>>().toMatchTypeOf<v12.RenderResult>();
  });

  it('parse(text, { suppressErrors }) → Promise<ParseResult | false>', () => {
    const parse: V12['parse'] = v13.parse;
    expectTypeOf(parse).toBeFunction();
    const suppressed = (text: string) => v13.parse(text, { suppressErrors: true });
    expectTypeOf(suppressed).returns.resolves.toEqualTypeOf<v13.ParseResult | false>();
    const strict = (text: string) => v13.parse(text);
    expectTypeOf(strict).returns.resolves.toMatchTypeOf<{ diagramType: string }>();
  });

  it('initialize(config) accepts a v12 config object', () => {
    const initialize: (config: Parameters<V12['initialize']>[0]) => void = v13.initialize;
    expectTypeOf(initialize).toBeFunction();
  });

  it('run(options?) accepts v12 RunOptions and resolves to void (the DOM adapter)', () => {
    const run: V12['run'] = v13.run;
    expectTypeOf(run).toBeFunction();
    expectTypeOf<v13.RunOptions>().toEqualTypeOf<v12.RunOptions>();
    expectTypeOf(v13.run).returns.resolves.toBeVoid();
  });
});
