import { describe, expect, it } from 'vitest';
import {
  WARDLEY_COORDINATE_AMBIGUOUS,
  WARDLEY_EVOLVE_PIPELINE_COMPONENT,
  WARDLEY_LINK_DROPPED,
  WARDLEY_OUT_OF_RANGE,
  WARDLEY_PIPELINE_REPLACED,
  WARDLEY_UNKNOWN_TARGET,
} from '@mermaid-js/diagram-wardley';
import { MermaidError } from 'mermaid';
import { wardleyCases, wardleyCorpus } from './corpus.ts';
import { deterministicApi } from '../render-api.ts';

/**
 * The parser's D425 and D428 warnings through the public `render()`: `RenderResult.warnings`
 * keeps a warning's `astIds`, not its `related` ranges, so each names the AST ids of the
 * statements it is about, the warned one first and then those in `related`, in source order,
 * as the layout's warnings do.
 */
const FIXTURES = new Map(
  [...(await wardleyCorpus()), ...wardleyCases()].map((c) => [c.id, c.source])
);
/** `nightly-check/<name>.mmd`, else the case `wardley-cases/<name>`. */
function fixture(name: string): string {
  const source =
    FIXTURES.get(`e2e/nightly-check/${name}.mmd`) ?? FIXTURES.get(`wardley-cases/${name}`);
  if (source === undefined) throw new Error(`no fixture ${name}`);
  return source;
}

const warningsOf = async (name: string) =>
  (await deterministicApi().render('w', fixture(name))).warnings.map(({ code, astIds }) => ({
    code,
    astIds,
  }));

describe('wardley parser warnings name their statements in render() (D425, D428)', () => {
  it('WARDLEY_LINK_DROPPED names every dropped link', async () => {
    expect(await warningsOf('render-dropped-links')).toEqual([
      { code: WARDLEY_LINK_DROPPED, astIds: ['link:A->A', 'link:A->Nowhere'] },
    ]);
  });

  it('WARDLEY_UNKNOWN_TARGET names the evolve', async () => {
    expect(await warningsOf('parser-range-evolve-unknown')).toEqual([
      { code: WARDLEY_UNKNOWN_TARGET, astIds: ['evolve:Cup'] },
    ]);
  });

  it('WARDLEY_EVOLVE_PIPELINE_COMPONENT names the evolve (D745)', async () => {
    expect(await warningsOf('parser-evolve-pipeline-child')).toEqual([
      { code: WARDLEY_EVOLVE_PIPELINE_COMPONENT, astIds: ['evolve:c'] },
    ]);
  });

  it('WARDLEY_PIPELINE_REPLACED names the replacing pipeline and the first one', async () => {
    expect(await warningsOf('parser-pipeline-replaced')).toEqual([
      { code: WARDLEY_PIPELINE_REPLACED, astIds: ['pipeline:Kettle@2', 'pipeline:Kettle'] },
    ]);
  });

  it('WARDLEY_COORDINATE_AMBIGUOUS names each statement once', async () => {
    expect(await warningsOf('parser-coordinates-ambiguous')).toEqual([
      { code: WARDLEY_COORDINATE_AMBIGUOUS, astIds: ['node:A', 'node:B', 'note:1'] },
    ]);
  });

  it('an error code reaches render() in the SYNTAX error’s diagnostics', async () => {
    const e = await deterministicApi()
      .render('w', fixture('parser-range-anchor'))
      .then(
        () => undefined,
        (x: unknown) => x
      );
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).code).toBe('SYNTAX');
    expect((e as MermaidError).diagnostics.map((d) => d.code)).toEqual([WARDLEY_OUT_OF_RANGE]);
  });
});
