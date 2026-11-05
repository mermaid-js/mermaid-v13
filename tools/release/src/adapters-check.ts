/**
 * Pack-and-install checks for the editor adapters (#174, D135): run in a consumer directory
 * where `@mermaid-js/language-service-codemirror` and `@mermaid-js/language-service-monaco`
 * were installed from their tarballs, with the files of `fixtures/adapters` beside them.
 * `adapters-pack-cli.ts` runs them against tarballs of the working tree, `rehearse-cli.ts`
 * against a local registry.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import type { Metafile } from 'esbuild';
import { firstPartyFacets } from '../../../packages/language-service/src/generated/facets.gen.ts';

export const ADAPTERS = [
  '@mermaid-js/language-service-codemirror',
  '@mermaid-js/language-service-monaco',
] as const;

export const ADAPTER_FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'adapters');

/**
 * The first-party facet ids (`FirstPartyFacetId`): each adapter ships one grammar per id
 * (D134), and the service's facets are optional peers, one diagram package per id.
 */
export const FACET_IDS: readonly string[] = [
  ...new Set(firstPartyFacets.filter((e) => e.load !== undefined).map((e) => e.id)),
];

/** Each adapter's per-type grammar file under `src/generated/` and `dist/generated/`. */
export const GRAMMAR_FILE: Record<(typeof ADAPTERS)[number], (id: string) => string> = {
  '@mermaid-js/language-service-codemirror': (id) => `${id}.parser.js`,
  '@mermaid-js/language-service-monaco': (id) => `${id}.monarch.js`,
};

export interface AdapterCheck {
  readonly name: string;
  run(): string | Promise<string>;
}

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

function exec(cmd: string, argv: string[], cwd: string): string {
  try {
    return execFileSync(cmd, argv, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    throw new Error(`${cmd} ${argv.join(' ')} failed:\n${err.stdout ?? ''}${err.stderr ?? ''}`);
  }
}

/** Output files the entry loads through static imports, itself included. */
function eagerOutputs(meta: Metafile, entry: string): Set<string> {
  const seen = new Set<string>();
  const visit = (out: string) => {
    if (seen.has(out)) return;
    seen.add(out);
    for (const i of meta.outputs[out]?.imports ?? [])
      if (i.kind === 'import-statement' && !i.external) visit(i.path);
  };
  visit(entry);
  return seen;
}

/**
 * What is wrong with the grammar files in a code-split bundle (D134), or nothing: each of
 * `grammars` (a file whose input path ends with `file`, of type `id`) must be in exactly one
 * chunk, with no other type's grammar, that the entry reaches only through a dynamic import.
 * `isGrammar` tells a grammar input from the rest.
 */
export function lazyGrammarProblems(
  meta: Metafile,
  entry: string,
  grammars: readonly { readonly id: string; readonly file: string }[],
  isGrammar: (input: string) => boolean
): string[] {
  const problems: string[] = [];
  const grammarsIn = (out: string) =>
    Object.keys(meta.outputs[out]?.inputs ?? {}).filter(isGrammar);
  for (const out of eagerOutputs(meta, entry))
    if (grammarsIn(out).length > 0)
      problems.push(`${out} loads ${grammarsIn(out).join(', ')} eagerly`);
  for (const { id, file } of grammars) {
    const holding = Object.keys(meta.outputs).filter((o) =>
      grammarsIn(o).some((i) => i.endsWith(file))
    );
    if (holding.length !== 1) {
      problems.push(`${file} is in ${holding.length} chunks`);
      continue;
    }
    const others = grammarsIn(holding[0]!).filter((i) => !i.includes(`/generated/${id}.`));
    if (others.length > 0) problems.push(`${file} shares a chunk with ${others.join(', ')}`);
  }
  return problems;
}

/** The checks, in order, for an install in `dir`; `tarballs` are the adapters' own tarballs. */
export function adapterChecks(
  dir: string,
  opts: { tarballs?: ReadonlyMap<string, string>; tsc: string }
): AdapterCheck[] {
  const checks: AdapterCheck[] = [];
  if (opts.tarballs !== undefined) {
    const tarballs = opts.tarballs;
    checks.push({
      name: 'adapter tarballs ship dist/ with one grammar file per type, and no src/',
      run: () => {
        for (const name of ADAPTERS) {
          const tarball = tarballs.get(name);
          assert(tarball !== undefined, `${name} was not packed`);
          const files = exec('tar', ['-tzf', tarball], dir).split('\n');
          for (const f of ['package/dist/index.js', 'package/dist/index.d.ts', 'package/LICENSE'])
            assert(files.includes(f), `${name} has no ${f.slice(8)}`);
          for (const id of FACET_IDS) {
            const f = `package/dist/generated/${GRAMMAR_FILE[name](id)}`;
            assert(files.includes(f), `${name} has no ${f.slice(8)}`);
          }
          const src = files.filter((f) => f.startsWith('package/src/'));
          assert(src.length === 0, `${name} ships ${src.join(', ')}`);
        }
        return `${FACET_IDS.length} grammar files each`;
      },
    });
  }
  checks.push(
    {
      name: 'adapters import in Node and load every per-type grammar',
      run: () => {
        const out = JSON.parse(exec('node', ['adapters.mjs'], dir)) as Record<
          'lezer' | 'monarch',
          Record<string, number>
        >;
        for (const kind of ['lezer', 'monarch'] as const)
          assert(
            JSON.stringify(Object.keys(out[kind]).sort()) === JSON.stringify([...FACET_IDS].sort()),
            `${kind} loaded ${Object.keys(out[kind]).join(', ')}`
          );
        return `Lezer and Monarch: ${FACET_IDS.join(', ')}`;
      },
    },
    {
      name: 'published adapter types compile (nodenext, skipLibCheck off)',
      run: () => {
        exec(process.execPath, [opts.tsc, '-p', 'tsconfig.json'], dir);
        return '';
      },
    },
    {
      name: 'browser bundle: each type’s grammar in its own lazy chunk',
      run: async () => {
        const result = await build({
          absWorkingDir: dir,
          entryPoints: ['bundle-adapters.mjs'],
          bundle: true,
          splitting: true,
          format: 'esm',
          platform: 'browser',
          outdir: join(dir, 'out', 'adapters'),
          metafile: true,
          logLevel: 'silent',
        });
        const meta = result.metafile;
        const entry = Object.keys(meta.outputs).find(
          (o) => meta.outputs[o]?.entryPoint === 'bundle-adapters.mjs'
        );
        assert(entry !== undefined, 'no entry chunk');
        const grammars = ADAPTERS.flatMap((name) =>
          FACET_IDS.map((id) => ({
            id,
            file: `node_modules/${name}/dist/generated/${GRAMMAR_FILE[name](id)}`,
          }))
        );
        const problems = lazyGrammarProblems(meta, entry, grammars, (i) =>
          /node_modules\/@mermaid-js\/language-service-(?:codemirror|monaco)\/dist\/generated\//.test(
            i
          )
        );
        assert(problems.length === 0, problems.join('\n'));
        return `${grammars.length} lazy grammar chunks`;
      },
    }
  );
  return checks;
}

/** The workspace packages `names` need: their dependencies and peers, optional ones too. */
export function workspaceClosure(
  names: readonly string[],
  manifests: ReadonlyMap<string, string>
): string[] {
  const out = new Set<string>();
  const visit = (name: string) => {
    if (out.has(name)) return;
    const dir = manifests.get(name);
    if (dir === undefined) return;
    out.add(name);
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })) visit(dep);
  };
  names.forEach(visit);
  return [...out];
}
