import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { patchC4Oracle } from './c4/oracle-env.ts';
import { patchEventModelingOracle } from './eventmodeling/oracle-env.ts';
import { patchGanttOracle } from './gantt/oracle-env.ts';
import { patchQuadrantOracle } from './quadrant/oracle-env.ts';
import { patchSequenceOracle } from './sequence/oracle-env.ts';
import { patchXyChartOracle } from './xychart/oracle-env.ts';

/**
 * The `mermaid@12` oracle: parser + DB only, through v12's diagram API, with no DOM.
 *
 * v12 sanitises label text with DOMPurify, which has no `sanitize`/`addHook` without a
 * `window`. We patch v12's own DOMPurify instance to identity functions before mermaid runs,
 * so the oracle yields the pre-sanitise model text (the form v13 stores). Sanitising is
 * covered by the security suites, not by parity.
 */
export type OracleResult =
  | { accepted: true; diagramType: string; db: unknown }
  | { accepted: false; diagramType?: undefined; error: string };

export interface Oracle {
  /** mermaid@12 version in use. */
  version: string;
  /**
   * Parse one source. The returned `db` is only valid until the next call. `config` is set
   * as the site config (as `mermaid.initialize` does) for this parse only, e.g.
   * `{ securityLevel: 'loose' }`, which diagram text cannot set.
   */
  parse(text: string, config?: Record<string, unknown>): Promise<OracleResult>;
}

interface MermaidV12 {
  parse(text: string): Promise<unknown>;
  initialize(config: Record<string, unknown>): void;
  mermaidAPI: {
    getDiagramFromText(text: string): Promise<{ type: string; db: unknown }>;
    reset(): void;
  };
}

const identityPurify = {
  sanitize: (text: unknown) => text,
  addHook() {},
  removeHook() {},
  removeHooks() {},
  removeAllHooks() {},
  setConfig() {},
  clearConfig() {},
  isSupported: true,
};

let loading: Promise<Oracle> | undefined;

/** Load (once) and return the oracle. */
export function loadOracle(): Promise<Oracle> {
  loading ??= load();
  return loading;
}

async function load(): Promise<Oracle> {
  const require = createRequire(import.meta.url);
  const pkgDir = realpathSync(dirname(require.resolve('mermaid-v12/package.json')));
  const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as {
    version: string;
  };
  // pnpm puts v12's own dependencies next to it, so this is the instance mermaid imports.
  const purifyDir = join(dirname(pkgDir), 'dompurify');
  const purifyPkg = JSON.parse(readFileSync(join(purifyDir, 'package.json'), 'utf8')) as {
    exports: { '.': { import: { default: string } } };
  };
  const purifyUrl = pathToFileURL(join(purifyDir, purifyPkg.exports['.'].import.default)).href;
  const purify = ((await import(purifyUrl)) as { default: object }).default;
  Object.assign(purify, identityPurify);

  const mermaid = ((await import('mermaid-v12')) as unknown as { default: MermaidV12 }).default;
  // Registers v12's diagrams; getDiagramFromText needs that first.
  await mermaid.parse('flowchart LR\n  A');
  // Box colours need `window.CSS` (sequence/oracle-env.ts).
  await patchSequenceOracle(mermaid);
  // The quadrant DB hides its builder's data; record the grammar's calls (quadrant/oracle-env.ts).
  await patchQuadrantOracle(mermaid);
  // Gantt acceptance includes `getTasks()`, and its clicks are recorded (gantt/oracle-env.ts).
  await patchGanttOracle(mermaid);
  // XY chart acceptance includes having a plot, as v12's render requires (xychart/oracle-env.ts).
  await patchXyChartOracle(mermaid);
  // C4: accessibility values cleared per parse, relation ends checked as v12's render did
  // (c4/oracle-env.ts).
  await patchC4Oracle(mermaid);
  // Event modeling's AST, kept for model parity (eventmodeling/oracle-env.ts).
  await patchEventModelingOracle(mermaid);

  return {
    version,
    async parse(text, config) {
      if (config) mermaid.initialize(config);
      // Directives and front matter mutate v12's global config; start every input clean.
      mermaid.mermaidAPI.reset();
      try {
        const diagram = await mermaid.mermaidAPI.getDiagramFromText(text);
        return { accepted: true, diagramType: diagram.type, db: diagram.db };
      } catch (error) {
        return { accepted: false, error: error instanceof Error ? error.message : String(error) };
      } finally {
        if (config) mermaid.initialize({});
      }
    },
  };
}
