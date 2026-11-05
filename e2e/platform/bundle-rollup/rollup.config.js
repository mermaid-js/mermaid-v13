// Rollup app (R-PLUG-4, D164): the pages, ESM with code splitting, with the Mermaid bundler
// plugin (`MERMAID_PLUGIN=off` builds without it).
import mermaid from '@mermaid-js/bundler-plugin/rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
  input: { 'src/flowchart': 'src/flowchart.js', 'src/all': 'src/all.js', 'src/plugin': 'src/plugin.js' },
  plugins: [
    nodeResolve({ browser: true }),
    ...(process.env.MERMAID_PLUGIN === 'off' ? [] : [mermaid()]),
  ],
  output: {
    dir: 'dist',
    format: 'es',
    entryFileNames: '[name].js',
    chunkFileNames: 'chunks/[name]-[hash].js',
    // The test maps each chunk to the packages in it through its source map.
    sourcemap: true,
  },
};
