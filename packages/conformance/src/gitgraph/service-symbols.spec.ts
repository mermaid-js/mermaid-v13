import { describe, expect, it } from 'vitest';
import { gitGraphLanguage } from '@mermaid-js/diagram-gitgraph/language';
import type { Range, SymbolOccurrence } from '@mermaid-js/core/parser-kit';
import { createLanguageService, firstPartyFacets } from '@mermaid-js/language-service';
import type { DocumentSnapshot } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
import { gitGraphGateCorpus } from './corpus.ts';
import { gitGraphV12Snapshot } from './v12.ts';
import { sanitizeLikeV12 } from './v13.ts';

/**
 * The oracle expectations re-run through the language service for gitGraph (language.md
 * step 8, D99 suite 2, R-LANG-1, #372), checked against the mermaid v12 DB over the gitGraph
 * gate corpus:
 * - every v12 branch but the main one resolves to exactly one definition, the name at its
 *   first `branch` statement, and references from any of its occurrences give the same list,
 *   with that definition in it;
 * - every commit id v12 has that the text wrote (not a derived `<seq>-*` one) resolves the same
 *   way, to the first commit or merge `id:` that writes it; branch names and commit ids are
 *   separate namespaces, so a branch and a commit of the same name never meet;
 * - the main branch has no occurrence (its name lives in config), and v12 has it;
 * - every definition is a v12 branch or commit id;
 * - a multi-line v12 `accDescr` is an `accDescr` fold range.
 *
 * A name whose text between the quotes is not its name (an escape, an entity, a comment line or
 * CRLF inside it) is no service occurrence, so a rename could not keep it: counted in
 * {@link ESCAPED}, not checked.
 *
 * The service loads the facet through the generated registry row (gitGraph's manifest
 * `language` entry, #374).
 */

/** v12 names written otherwise than their name in the corpus (skipped above). */
const ESCAPED = 4;

const service = createLanguageService();
await service.preload({ types: ['gitGraph'] });
const text = (doc: DocumentSnapshot, r: Range) => doc.text.slice(r.start, r.end);
const DERIVED = /^\d+-\*$/;

describe('gitGraph definition, references and folding through the service match v12', () => {
  it('over the gate corpus', async () => {
    const oracle = await loadOracle();
    const problems: string[] = [];
    let checked = 0;
    let names = 0;
    let escaped = 0;
    for (const item of await gitGraphGateCorpus()) {
      const v12 = await oracle.parse(item.source);
      if (!v12.accepted || v12.diagramType !== 'gitGraph') continue;
      const model = gitGraphV12Snapshot(v12.db);
      const doc = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'gitGraph') continue;
      if (doc.diagnostics().some((d) => d.severity === 'error')) continue;
      checked++;
      const fail = (what: string) => problems.push(`${item.id}: ${what}`);
      const parsed = gitGraphLanguage.parse(item.source, { keepTokens: true });
      const main = (parsed.model as { mainBranch: string }).mainBranch;
      if (!model.branches.includes(main)) fail(`v12 has no main branch ${main}`);
      if (parsed.symbols.some((s) => s.kind === 'branch' && s.name === main))
        fail(`the main branch ${main} has an occurrence`);

      /** One v12 name of `kind`: its occurrences agree on one definition, the first def. */
      const check = (v12Name: string, kind: string) => {
        // v12 names went through its `sanitizeText` (D263): match the v13 name that way.
        const written = new Set(
          parsed.symbols
            .filter((s) => s.kind === kind && sanitizeLikeV12(s.name) === v12Name)
            .map((s) => s.name)
        );
        if (written.size === 0) fail(`${kind} ${JSON.stringify(v12Name)} has no occurrence`);
        for (const name of written) checkName(name, kind);
      };
      const checkName = (name: string, kind: string) => {
        names++;
        const quotedOrBare = (s: SymbolOccurrence) =>
          [name, `"${name}"`, `'${name}'`].includes(text(doc, s.range));
        const all = parsed.symbols.filter((s) => s.kind === kind && s.name === name);
        const at = all.filter(quotedOrBare);
        if (at.length === 0) {
          escaped++;
          return;
        }
        const inner = (s: SymbolOccurrence) =>
          s.range.start + (text(doc, s.range) === name ? 0 : 1);
        const first = inner(at.find((s) => s.role === 'def') ?? at[0]!);
        const lists = new Set<string>();
        for (const o of at) {
          const cursor = inner(o);
          const d = doc.definition(cursor);
          if (!d || d.start !== first || text(doc, d) !== name)
            fail(`${kind} ${name}: definition ${d && JSON.stringify(text(doc, d))} at ${d?.start}`);
          lists.add(JSON.stringify(doc.references(cursor)));
        }
        if (lists.size !== 1) fail(`${kind} ${name}: references differ by occurrence`);
        const refs = doc.references(first);
        if (refs.length !== at.length || !refs.some((r) => r.start === first))
          fail(`${kind} ${name}: ${refs.length} references for ${at.length} occurrences`);
      };
      // The service has no symbol for an empty name (`id:""`), for any type.
      for (const b of model.branches) if (b !== main && b !== '') check(b, 'branch');
      for (const c of model.commits) if (!DERIVED.test(c.id) && c.id !== '') check(c.id, 'commit');

      const known = new Set([
        ...model.branches.map((b) => `branch\0${b}`),
        ...model.commits.map((c) => `commit\0${c.id}`),
      ]);
      for (const s of parsed.symbols) {
        if (s.name !== '' && !known.has(`${s.kind}\0${sanitizeLikeV12(s.name)}`))
          fail(`${s.kind} ${s.name} is no v12 ${s.kind}`);
      }
      const multiLine = /[\r\n]/.test(model.accDescr);
      const fold = doc.foldingRanges().some((f) => f.kind === 'accDescr');
      if (multiLine && !fold) fail('a multi-line accDescr has no fold range');
    }
    expect(checked).toBeGreaterThan(900);
    expect(names).toBeGreaterThan(3500);
    expect(escaped).toBe(ESCAPED);
    expect(problems).toEqual([]);
  }, 300_000);

  it('loads the facet from the generated registry (#374)', () => {
    const row = firstPartyFacets.find((e) => e.type === 'gitGraph');
    expect(row?.load).toBeTypeOf('function');
    expect(service.update('x:///g', 'gitGraph\n  commit').facet?.id).toBe('gitGraph');
  });
});
