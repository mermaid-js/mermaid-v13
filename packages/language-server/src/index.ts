/**
 * `@mermaid-js/language-server` (R-LANG-2, D98): the language service over LSP. Run the
 * `mermaid-language-server` bin (stdio), or wire `startServer` to a connection of your own.
 */
export { isMermaidUri, startServer } from './server.ts';
export type { ServerOptions } from './server.ts';
export { discoverFacets } from './discover.ts';
export type { DiscoverOptions } from './discover.ts';
export { encodeSemanticTokens } from './convert.ts';
