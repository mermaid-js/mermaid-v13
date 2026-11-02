/**
 * The dev build of mermaid, served at `/mermaid.esm.mjs`: the public `mermaid` package plus
 * `@mermaid-js/plugin-interactions`, bundled from the workspace TypeScript sources as one ESM
 * file and rebuilt on every source change. Register the plugin with
 * `registerExternalDiagrams([interactions])` (or a `createMermaid()` instance's).
 */
export * from 'mermaid';
export { default } from 'mermaid';
export { interactions } from '@mermaid-js/plugin-interactions';
