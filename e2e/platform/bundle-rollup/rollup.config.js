// Rollup app (R-PLUG-4): both pages, ESM with code splitting.
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
  input: { 'src/flowchart': 'src/flowchart.js', 'src/all': 'src/all.js' },
  plugins: [nodeResolve({ browser: true })],
  output: {
    dir: 'dist',
    format: 'es',
    entryFileNames: '[name].js',
    chunkFileNames: 'chunks/[name]-[hash].js',
    // The test maps each chunk to the packages in it through its source map.
    sourcemap: true,
  },
};
