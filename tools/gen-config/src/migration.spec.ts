/**
 * R-COMPAT-9 / R-CONF-1: MIGRATION.md explains every config key v13 removed or moved, and the
 * topics the M1 ticket (#19) requires, in its hand-written part. The generated config section
 * (between the markers) is checked for staleness by `pnpm check:config`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MIGRATION_BEGIN, MIGRATION_DOC, MIGRATION_END, SCHEMA_PATH } from './generate.ts';
import { annotationOf, declaredKeys, loadSchema } from './schema.ts';

const root = join(import.meta.dirname, '../../..');
const doc = readFileSync(join(root, MIGRATION_DOC), 'utf8');
const schema = loadSchema(readFileSync(join(root, SCHEMA_PATH), 'utf8'));

/** The guide without its generated config section. */
const handWritten = (() => {
  const begin = doc.indexOf(MIGRATION_BEGIN);
  const end = doc.indexOf(MIGRATION_END);
  return begin < 0 || end < begin ? doc : doc.slice(0, begin) + doc.slice(end);
})();

const keysWith = (...statuses: string[]) => [
  ...new Set(
    declaredKeys(schema)
      .filter(({ node }) => statuses.includes(annotationOf(node).status))
      .map(({ key }) => key)
  ),
];

describe('MIGRATION.md', () => {
  it('has the generated config section', () => {
    expect(doc).toContain(MIGRATION_BEGIN);
    expect(doc).toContain(MIGRATION_END);
  });

  it.each(keysWith('removed', 'moved'))('explains the removed or moved key `%s`', (key) => {
    expect(handWritten).toContain(`\`${key}\``);
  });

  it.each(keysWith('ignored'))('mentions the ignored key `%s` outside the table', (key) => {
    expect(handWritten).toContain(`\`${key}\``);
  });

  // Ticket #19 "Include at least", plus behaviour changes recorded by the M1 tickets.
  it.each([
    ['mermaidAPI removed', /`mermaidAPI`[^\n]*[Rr]emoved/],
    ['htmlLabels removed', /`htmlLabels`/],
    ['click callbacks move to the interactions plugin', /`@mermaid-js\/plugin-interactions`/],
    [
      'bindFunctions only with the interactions plugin',
      /`(?:RenderResult\.)?bindFunctions`[^\n]*interactions/,
    ],
    [
      'securityLevel values mapped to default',
      /`securityLevel: 'loose'` \(and `antiscript`, `sandbox`\) now means `default`/,
    ],
    ['inline arrowheads instead of <marker>', /`<marker>`/],
    ['data-id and data-ast instead of ids', /`data-id`[^\n]*`data-ast`/],
    ['redux is the default theme', /`redux`[^\n]*default theme|default theme[^\n]*`redux`/],
    ['theme name fallbacks', /`redux-dark`/],
    ['layout names dagre/elk', /`dagre`[^\n]*`layered`/],
    ['registerIconPacks', /`registerIconPacks/],
    // #330: icons move from page CSS to registered packs (D291, D295, D297, D299).
    ['an Icons section', /### Icons/],
    ['icons from a pack, not Font Awesome CSS', /`@iconify-json\/fa6-solid`/],
    ['unresolved icons warn ICON_NOT_RENDERED', /`ICON_NOT_RENDERED`/],
    ['the deprecated ICON_UNAVAILABLE alias', /`ICON_UNAVAILABLE`[^\n]*deprecated/],
    ['what the icon converter drops', /`ICON_SIMPLIFIED`/],
    ['mindmap icons', /`::icon\(/],
    ['error image', /`renderErrorSvg\(/],
    ['front matter and directive divergences', /## Front matter and directives/],
    ['DOM-free rendering', /`container`/],
  ])('covers: %s', (_name, pattern) => {
    expect(handWritten).toMatch(pattern);
  });
});
