// Vite app (R-PLUG-4, D164): the pages as a multi-page build, with the Mermaid bundler plugin
// (`MERMAID_PLUGIN=off` builds without it).
import mermaid from '@mermaid-js/bundler-plugin/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: process.env.MERMAID_PLUGIN === 'off' ? [] : [mermaid()],
  build: {
    target: 'es2022',
    // The test maps each chunk to the packages in it through its source map.
    sourcemap: true,
    rolldownOptions: {
      input: { flowchart: 'flowchart.html', all: 'all.html', plugin: 'plugin.html' },
    },
  },
});
