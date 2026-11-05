// roughjs's `bin/` modules import their siblings without file extensions, so Node's ES module
// loader cannot load `roughjs/bin/generator.js`, and the package's main entry is a CommonJS
// build. The ES module bundle loads in Node and in every bundler and is the same code in both,
// so a sketch is the same in Node and the browser. It has no types of its own: these are
// `bin/rough.d.ts`'s, without the DOM-bound `canvas` and `svg`, which the plugin never calls.
declare module 'roughjs/bundled/rough.esm.js' {
  import type { Config } from 'roughjs/bin/core.js';
  import type { RoughGenerator } from 'roughjs/bin/generator.js';

  const rough: {
    generator(config?: Config): RoughGenerator;
  };
  export default rough;
}
