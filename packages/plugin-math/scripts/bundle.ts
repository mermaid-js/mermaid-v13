// cspell:words mathjax newcm
/**
 * How the published engine is built (#245): `dist/engine.js` bundles MathJax and its TeX font,
 * so consumers neither install MathJax nor resolve its `#default-font/*` package import, which
 * would pull in New Computer Modern as well (1,034 KB gz instead of about 677 KB gz, #244).
 * `@mermaid-js/core` stays external: it is the plugin's peer.
 */
import { fileURLToPath } from 'node:url';
import type { BuildOptions, Plugin } from 'esbuild';

/** The package root: the alias resolves the TeX font from here, where it is a dependency. */
export const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));

/**
 * MathJax's SVG output imports its default font through the `#default-font/*` package import
 * (New Computer Modern). MathJax's own builds alias it; this points it at the TeX font.
 */
export const texDefaultFont: Plugin = {
  name: 'tex-default-font',
  setup(b) {
    b.onResolve({ filter: /^#default-font\// }, (args) =>
      b.resolve(args.path.replace('#default-font/', '@mathjax/mathjax-tex-font/js/'), {
        kind: args.kind,
        resolveDir: PACKAGE_DIR,
      })
    );
  },
};

const BANNER =
  '/*! @mermaid-js/plugin-math engine. Bundles MathJax (@mathjax/src) and @mathjax/mathjax-tex-font, Copyright (c) 2017-2026 The MathJax Consortium, Apache-2.0: see THIRD_PARTY_NOTICES. */';

/** esbuild options for `dist/engine.js`. */
export function engineBuild(outfile: string): BuildOptions {
  return {
    entryPoints: [fileURLToPath(new URL('../src/engine.ts', import.meta.url))],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    mainFields: ['module', 'main'],
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    banner: { js: BANNER },
    conditions: ['mermaid-source'],
    external: ['@mermaid-js/core', '@mermaid-js/core/*'],
    plugins: [texDefaultFont],
    logLevel: 'warning',
  };
}
