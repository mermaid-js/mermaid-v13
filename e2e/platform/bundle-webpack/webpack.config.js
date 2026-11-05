// webpack app (R-PLUG-4): both pages in production mode, chunks split at dynamic imports.
import { fileURLToPath } from 'node:url';

export default {
  mode: 'production',
  entry: { 'src/flowchart': './src/flowchart.js', 'src/all': './src/all.js' },
  plugins: [],
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
};
