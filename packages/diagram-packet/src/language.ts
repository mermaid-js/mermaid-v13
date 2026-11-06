/**
 * Packet language facet (`@mermaid-js/diagram-packet/language`, DESIGN §4.5, R-LANG-8, D89):
 * the parser entry and the tables the language service needs. Nothing reachable from here
 * imports the layout or a renderer; the import-boundary lint and the bench's language bundle
 * spec hold that in place.
 *
 * Symbols (D346): each field label is a `field` symbol over its quoted string (D191), its own
 * definition with no references: repeated labels are separate fields, so `field` is a
 * `standalone` kind. The service renames the text between the quotes, keeps them, and allows a
 * name another field already has.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { packetSectionOf } from './config.ts';
import { packetCompletions } from './facet/completions.ts';
import { packetHover } from './facet/hover.ts';
import { packetCategories } from './generated/categories.ts';
import { parsePacket } from './parser/index.ts';
import type { PacketDocument } from './parser/index.ts';

export { packetCategories } from './generated/categories.ts';
export { packetDocs } from './generated/docs.ts';
export { detectPacket, PacketTokenKind, packetTokens, parsePacket } from './parser/index.ts';
export type * from './parser/index.ts';

/** The packet facet. */
export const packetLanguage: LanguageFacet<PacketDocument> = {
  id: 'packet',
  // The service passes no config, but rows (and so which fields the row cap drops) depend on
  // `bitsPerRow`: read the source's own front matter and directives, as the renderer does.
  // The preprocess diagnostics are the service's to add (`LanguageFacet.parse`).
  parse: (text, options) => {
    const preprocessed = preprocess(text);
    return parsePacket(text, { ...options, preprocessed, config: packetSectionOf(preprocessed) });
  },
  categories: packetCategories,
  namespaces: [['field']],
  standalone: ['field'],
  // Required by the facet interface, but the service asks only for a name written bare, and a
  // packet label is always quoted: the quoted-name check and the read-back decide (D346).
  isValidId: () => undefined,
  completions: packetCompletions,
  hover: packetHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { packetLanguage as language };
