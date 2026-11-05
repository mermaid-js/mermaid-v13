// Vite app (R-PLUG-4): both pages as a multi-page build.
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [],
  build: {
    target: 'es2022',
    // The test maps each chunk to the packages in it through its source map.
    sourcemap: true,
    rolldownOptions: { input: { flowchart: 'flowchart.html', all: 'all.html' } },
  },
});
