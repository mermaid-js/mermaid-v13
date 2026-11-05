// webpack app (R-PLUG-4, D164): the pages in production mode, chunks split at dynamic imports,
// with the Mermaid bundler plugin (`MERMAID_PLUGIN=off` builds without it).
import { fileURLToPath } from 'node:url';
import mermaid from '@mermaid-js/bundler-plugin/webpack';

export default {
  mode: 'production',
  entry: {
    'src/flowchart': './src/flowchart.js',
    'src/all': './src/all.js',
    'src/plugin': './src/plugin.js',
  },
  plugins: process.env.MERMAID_PLUGIN === 'off' ? [] : [mermaid()],
  output: {
    path: fileURLToPath(new URL('dist', import.meta.url)),
    filename: '[name].js',
    chunkFilename: 'chunks/[name]-[contenthash].js',
    // The pages load the entries as module scripts, which have no `document.currentScript`.
    publicPath: '/',
    clean: true,
  },
  // The test maps each chunk to the packages in it through its source map.
  devtool: 'source-map',
  // `MERMAID_CACHE=1`: webpack's persistent cache, as Next.js uses it.
  cache: process.env.MERMAID_CACHE === '1' ? { type: 'filesystem' } : false,
};
