/**
 * The fixture diagram package's main export (D586, R-PLUG-3): a lazy descriptor. The app
 * registers it with `registerExternalDiagrams([box])`. The detector comes from its own small
 * module and is imported eagerly; the entry is behind `import()`, so a bundler puts it in its own
 * chunk and it loads on the first render of a `fixturebox` diagram.
 */
import { detector } from './detector.js';

export default {
  id: 'fixturebox',
  detector,
  formats: ['svg'],
  loader: () => import('./entry.js'),
};
