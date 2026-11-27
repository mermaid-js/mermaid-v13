/**
 * Architecture labels by the label rule (spec #1368, #1407): group titles, service titles and
 * edge labels, through `createMermaid().render()`, over `pr-check/label-syntax*.mmd`.
 */
import { labelSyntaxSuite } from '../label-syntax.ts';

labelSyntaxSuite({
  folder: 'architecture',
  section: 'architecture',
  kinds: ['group', 'service', 'edge'],
  quoted: `architecture-beta
  group g(cloud)["\`group **bold**\`"]
  service s(server)["\`service **bold**\`"] in g
  service t "\`**T**\`"["\`text _icon_\`"] in g
  s:R -["\`edge **bold**\`"]- L:t
`,
});
