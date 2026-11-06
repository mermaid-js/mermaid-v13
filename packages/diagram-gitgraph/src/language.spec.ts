import { describe, expect, it } from 'vitest';
import { gitGraphLanguage, language } from './language.ts';

/**
 * The gitGraph language facet (#372) at its own seam: parse, `isValidId`, completions at a
 * probe parse and hover over a plain parse, as the language service calls them. The
 * service-level behaviour (definition, references, rename, folding, semantic tokens) is in the
 * goldens (`packages/language-service/goldens/gitGraph`).
 */
const CURSOR = '¦';

function split(marked: string): [text: string, at: number] {
  const at = marked.indexOf(CURSOR);
  return [marked.slice(0, at) + marked.slice(at + 1), at];
}

/** Symbols as `kind name role "text"`. */
function symbols(text: string): string[] {
  return gitGraphLanguage
    .parse(text, { keepTokens: true })
    .symbols.map((s) => `${s.kind} ${s.name} ${s.role} ${text.slice(s.range.start, s.range.end)}`);
}

describe('gitGraph language facet', () => {
  it('is the gitGraph facet under the fixed name `language`, branches and commits apart', () => {
    expect(gitGraphLanguage.id).toBe('gitGraph');
    expect(language).toBe(gitGraphLanguage);
    expect(gitGraphLanguage.namespaces).toEqual([['branch'], ['commit']]);
  });

  it('parses with the tokens kept and a category for every token kind', () => {
    const text =
      'gitGraph TB:\n  accTitle: t\n  accDescr {\n    d\n  }\n  title T\n  commit id:"A" msg:"m" tag:"v1" type: HIGHLIGHT\n  branch dev order: 1\n  checkout dev\n  commit\n  switch main\n  merge dev id:"M" type: REVERSE\n  cherry-pick id:"A" parent:"B" %% c\n';
    const result = gitGraphLanguage.parse(text, { keepTokens: true });
    const kinds = [...result.tokens!.kind.slice(0, result.tokens!.length)];
    expect(kinds.map((k) => gitGraphLanguage.categories[k])).not.toContain(undefined);
  });

  it('records no symbol for the main branch: its name lives in config', () => {
    expect(
      symbols('gitGraph\ncommit id:"A"\nbranch dev\ncheckout main\nmerge dev\ncheckout dev')
    ).toEqual([
      'commit A def "A"',
      'branch dev def dev',
      'branch dev ref dev',
      'branch dev ref dev',
    ]);
    expect(symbols('gitGraph\nbranch main\ncheckout "main"\nmerge main')).toEqual([]);
  });

  it("reads the main branch's name from the document's config", () => {
    const front = '---\nconfig:\n  gitGraph:\n    mainBranchName: trunk\n---\n';
    const text = `${front}gitGraph\ncommit\nbranch main\ncommit\ncheckout trunk\nmerge main`;
    const result = gitGraphLanguage.parse(text, { keepTokens: true });
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(symbols(text)).toEqual(['branch main def main', 'branch main ref main']);
    const directive =
      '%%{init: {"gitGraph": {"mainBranchName": "dev"}}}%%\ngitGraph\ncommit\ncheckout dev';
    expect(gitGraphLanguage.parse(directive, { keepTokens: true }).diagnostics).toEqual([]);
    // A directive wins over the front matter, as config resolution has it.
    const both = `${front}%%{init: {"gitGraph": {"mainBranchName": "dev"}}}%%\ngitGraph\ncheckout dev`;
    expect(gitGraphLanguage.parse(both, { keepTokens: true }).diagnostics).toEqual([]);
  });
});

describe('gitGraph isValidId (D92)', () => {
  it('takes a bare branch name the lexer reads as one name', () => {
    for (const ok of ['dev', 'feature/x.y', '1.0.1', 'hotfix-2', 'a_b', 'x-'])
      expect(gitGraphLanguage.isValidId(ok, 'branch'), ok).toBeUndefined();
    expect(gitGraphLanguage.isValidId('dev')).toBeUndefined();
    for (const bad of [
      '',
      'two words',
      'a"b',
      'x.',
      'commit',
      'title',
      'titled',
      'LR',
      '123',
      'a;b',
    ])
      expect(gitGraphLanguage.isValidId(bad, 'branch'), bad).toMatch(/branch name/);
  });

  it('takes any commit id but an empty one: commit ids are always quoted', () => {
    expect(gitGraphLanguage.isValidId('two words', 'commit')).toBeUndefined();
    expect(gitGraphLanguage.isValidId('', 'commit')).toMatch(/empty/);
  });
});

/** Completion labels at `¦`. */
function complete(marked: string): string[] {
  const [text, at] = split(marked);
  const result = gitGraphLanguage.parse(text, { keepTokens: true, probe: at });
  return gitGraphLanguage.completions(result.probe!, { text, result }).map((c) => c.label);
}

/** The text each item at `¦` replaces, and what it inserts. */
function edits(marked: string): [string, string][] {
  const [text, at] = split(marked);
  const result = gitGraphLanguage.parse(text, { keepTokens: true, probe: at });
  return gitGraphLanguage
    .completions(result.probe!, { text, result })
    .map((c) => [text.slice(c.range.start, c.range.end), c.insertText]);
}

const STATEMENTS = [
  'commit',
  'branch',
  'merge',
  'checkout',
  'switch',
  'cherry-pick',
  'title',
  'accTitle',
  'accDescr',
];
const HEADERS = ['gitGraph', 'gitGraph LR:', 'gitGraph TB:', 'gitGraph BT:'];

describe('gitGraph completions (D95)', () => {
  it('offers the header in an empty text', () => {
    expect(complete('¦')).toEqual(HEADERS);
    expect(complete('git¦')).toEqual(HEADERS);
    expect(complete('%% c\n¦')).toEqual(HEADERS);
  });

  it('offers the directions after `gitGraph`, on its line, then the colon', () => {
    expect(complete('gitGraph ¦')).toEqual(['LR:', 'TB:', 'BT:']);
    expect(complete('gitGraph t¦')).toEqual(['TB:']);
    expect(edits('gitGraph TB¦')).toEqual([['TB', 'TB:']]);
    expect(edits('gitGraph T¦B:')).toEqual([['TB:', 'TB:']]);
    expect(complete('gitGraph TB ¦')).toEqual([':']);
  });

  it('offers the statements at the start of a line', () => {
    expect(complete('gitGraph\n¦')).toEqual(STATEMENTS);
    expect(complete('gitGraph\n  commit\n  ¦\n  commit')).toEqual(STATEMENTS);
    expect(complete('gitGraph\n  ch¦')).toEqual(['checkout', 'cherry-pick']);
    // Without regard to case: a keyword typed in the wrong case is still offered.
    expect(complete('gitGraph\n  CO¦')).toEqual(['commit']);
    expect(complete('gitGraph\ncommit foo bar\n¦')).toEqual(STATEMENTS);
  });

  it('inserts the separator a statement needs, unless the text has it', () => {
    expect(edits('gitGraph\n  bra¦')).toEqual([['bra', 'branch ']]);
    expect(edits('gitGraph\n  com¦')).toEqual([['com', 'commit']]);
    expect(edits('gitGraph\n  acc¦')).toEqual([
      ['acc', 'accTitle: '],
      ['acc', 'accDescr: '],
    ]);
    expect(edits('gitGraph\n  che¦ckout dev')).toEqual([
      ['checkout', 'checkout'],
      ['checkout', 'cherry-pick'],
    ]);
    // A block `accDescr {` stays one.
    expect(edits('gitGraph\n  acc¦Descr {\n x\n }')).toEqual([['accDescr', 'accDescr']]);
  });

  it("offers each statement's options", () => {
    expect(complete('gitGraph\ncommit ¦')).toEqual(['id:', 'msg:', 'tag:', 'type:']);
    expect(complete('gitGraph\ncommit id:"A" ¦')).toEqual(['id:', 'msg:', 'tag:', 'type:']);
    expect(complete('gitGraph\ncommit\nbranch dev\nmerge dev ¦')).toEqual(['id:', 'tag:', 'type:']);
    expect(complete('gitGraph\ncherry-pick ¦')).toEqual(['id:', 'parent:', 'tag:']);
    expect(complete('gitGraph\nbranch dev ¦')).toEqual(['order:']);
    expect(complete('gitGraph\nbranch dev order: 1 ¦')).toEqual([]);
    expect(edits('gitGraph\ncommit t¦')).toEqual([
      ['t', 'tag: '],
      ['t', 'type: '],
    ]);
    expect(edits('gitGraph\ncommit i¦d:"x"')).toEqual([['id:', 'id:']]);
  });

  it('offers the commit types after `type:`', () => {
    expect(complete('gitGraph\ncommit type: ¦')).toEqual(['NORMAL', 'REVERSE', 'HIGHLIGHT']);
    expect(complete('gitGraph\ncommit type:¦')).toEqual(['NORMAL', 'REVERSE', 'HIGHLIGHT']);
    expect(edits('gitGraph\ncommit\nbranch b\nmerge b type: HI¦')).toEqual([['HI', 'HIGHLIGHT']]);
  });

  it('offers the branches made so far after `checkout`, `switch` and `merge`', () => {
    const graph = 'gitGraph\ncommit\nbranch dev\nbranch "my x"\ncommit\n';
    expect(complete(`${graph}checkout ¦\nbranch later`)).toEqual(['main', 'dev', '"my x"']);
    expect(complete(`${graph}switch d¦`)).toEqual(['dev']);
    expect(edits(`${graph}checkout "m¦`)).toEqual([
      ['"m', '"main"'],
      ['"m', '"my x"'],
    ]);
    // Not the branch checked out: merging it into itself is an error.
    expect(complete(`${graph}merge ¦`)).toEqual(['main', 'dev']);
    expect(edits(`${graph}checkout de¦v`)).toEqual([['dev', 'dev']]);
    expect(complete('gitGraph\nbranch ¦')).toEqual([]);
  });

  it('offers the main branch under its configured name', () => {
    const front = '---\nconfig:\n  gitGraph:\n    mainBranchName: trunk\n---\n';
    expect(complete(`${front}gitGraph\ncommit\nbranch dev\ncheckout ¦`)).toEqual(['trunk', 'dev']);
  });

  it("offers the commit ids a cherry-pick's `id:` can name", () => {
    const graph =
      'gitGraph\ncommit id:"A"\nbranch dev\ncommit id:"two words"\ncheckout main\nmerge dev id:"M"\ncommit id:"C"\ncheckout dev\n';
    // Written so far, not on the branch checked out; a merge only with a `parent:`.
    expect(complete(`${graph}cherry-pick id: ¦\ncommit id:"later"`)).toEqual(['"A"', '"C"']);
    expect(complete(`${graph}cherry-pick id: ¦ parent:"A"`)).toEqual(['"A"', '"M"', '"C"']);
    expect(edits(`${graph}cherry-pick id:"c¦`)).toEqual([['"c', '"C"']]);
    expect(edits(`${graph}cherry-pick id:"A¦"`)).toEqual([['"A"', '"A"']]);
    expect(edits(`${graph}cherry-pick id:"¦`)).toEqual([
      ['"', '"A"'],
      ['"', '"C"'],
    ]);
    // A new id is the author's to choose.
    expect(complete(`${graph}commit id: ¦`)).toEqual([]);
  });

  it("offers the merge's parents after `parent:`", () => {
    const graph =
      'gitGraph\ncommit id:"A"\nbranch dev\ncommit id:"two words"\ncheckout main\nmerge dev id:"M"\ncommit id:"C"\ncheckout dev\n';
    expect(complete(`${graph}cherry-pick id:"M" parent: ¦`)).toEqual(['"A"', '"two words"']);
    expect(complete(`${graph}cherry-pick parent:"¦" id:"M"`)).toEqual(['"A"', '"two words"']);
    expect(complete(`${graph}cherry-pick id:"C" parent: ¦`)).toEqual([]);
    expect(complete(`${graph}cherry-pick parent: ¦`)).toEqual([]);
  });

  it('quotes an id with the quote it does not hold', () => {
    expect(complete(`gitGraph\ncommit id:'say "hi"'\nbranch b\ncherry-pick id: ¦`)).toEqual([
      `'say "hi"'`,
    ]);
  });

  it('offers nothing in a text, a comment or front matter', () => {
    expect(complete('gitGraph\ntitle Re¦')).toEqual([]);
    expect(complete('gitGraph\naccTitle: x¦')).toEqual([]);
    expect(complete('gitGraph\ncommit msg:"a¦"')).toEqual([]);
    expect(complete('gitGraph\n%% c¦')).toEqual([]);
    expect(complete('---\ntitle: x¦\n---\ngitGraph')).toEqual([]);
  });
});

/** Hover at `¦` as `<hovered text> => <contents>`, given the token the service would pass. */
function hover(marked: string): string | undefined {
  const [text, at] = split(marked);
  const result = gitGraphLanguage.parse(text, { keepTokens: true });
  const tokens = result.tokens!;
  // The service's token: a non-blank one containing the offset, else one ending at it.
  let token: { kind: number; range: { start: number; end: number } } | undefined;
  let touching: typeof token;
  for (let i = 0; i < tokens.length; i++) {
    const start = tokens.start[i]!;
    const end = tokens.end[i]!;
    if (!/\S/.test(text.slice(start, end))) continue;
    if (start <= at && at < end) token = { kind: tokens.kind[i]!, range: { start, end } };
    else if (end === at) touching = { kind: tokens.kind[i]!, range: { start, end } };
  }
  token ??= touching;
  const h = gitGraphLanguage.hover({ offset: at, token }, { text, result });
  return h && `${text.slice(h.range.start, h.range.end)} => ${h.contents}`;
}

describe('gitGraph hover (D93)', () => {
  const graph =
    'gitGraph\ncommit id:"A" msg:"Fix" tag:"v1" type: HIGHLIGHT\nbranch dev order: 2\ncommit id:"B"\ncommit\ncheckout main\nmerge dev id:"M"\ncherry-pick id:"B" tag:"pick"\n';

  it('explains a keyword from the grammar docs', () => {
    expect(hover(`${graph}com¦mit`)).toMatch(/^commit => \*\*`commit`\*\*\n\n`commit id: /);
    expect(hover('gitGraph\ncommit ty¦pe: REVERSE')).toMatch(/^type: => \*\*`type:`\*\*/);
    expect(hover('gitGraph\ncommit type: REV¦ERSE')).toMatch(/^REVERSE => [\s\S]*crossed out/);
    expect(hover('gitGraph T¦B:')).toMatch(/^TB => [\s\S]*top to bottom/);
  });

  it('explains only the keyword of a text statement', () => {
    expect(hover('gitGraph\n  ti¦tle Release flow')).toMatch(/^title => \*\*`title`\*\*/);
    expect(hover('gitGraph\n  title Rel¦ease flow')).toBeUndefined();
    expect(hover('gitGraph\n  acc¦Title: x')).toMatch(/^accTitle => /);
  });

  it('shows nothing on a message, a tag or a number', () => {
    expect(hover('gitGraph\ncommit msg:"F¦ix"')).toBeUndefined();
    expect(hover('gitGraph\ncommit tag:"v¦1"')).toBeUndefined();
    expect(hover('gitGraph\nbranch dev order: 2¦')).toBeUndefined();
  });

  it('describes a branch where its name is written', () => {
    expect(hover(`${graph}checkout d¦ev`)).toBe('dev => **branch** `dev`\n\n2 commits · order: 2');
    expect(hover(`${graph.replace('branch dev', 'branch "dev"')}checkout "d¦ev"`)).toBe(
      '"dev" => **branch** `dev`\n\n2 commits · order: 2'
    );
    expect(hover('gitGraph\nbranch empty¦\n')).toBe(
      'empty => **branch** `empty`\n\nno commits · order: 0'
    );
    expect(hover('gitGraph\ncheckout nope¦')).toBe(
      'nope => **branch** `nope`\n\nNo branch of this name is made in this graph.'
    );
  });

  it('says the main branch is named in config', () => {
    expect(hover(`${graph}checkout ma¦in`)).toBe(
      'main => **branch** `main`\n\nThe main branch: its name is set in config (`gitGraph.mainBranchName`), so rename it there.\n\n3 commits · order: 0'
    );
  });

  it('describes a commit where its id is written', () => {
    expect(hover(`${graph}cherry-pick id:"A¦"`)).toBe(
      '"A" => **commit** `A` on `main`\n\nMessage: `Fix` · type: HIGHLIGHT · tags: `v1`'
    );
    expect(hover(graph.replace('id:"M"', 'id:"M¦"'))).toBe(
      '"M" => **commit** `M` on `main`\n\nMerge of `dev` · parents: `A`, `2-daa66d1`'
    );
    // A cherry-pick of a merge names what it merges, from the merge statement.
    expect(hover(`${graph}cherry-pick id:"M¦" parent:"A"`)).toMatch(
      /^"M" => [^\n]*\n\nMerge of `dev`/
    );
    expect(hover('gitGraph\ncommit id:"X¦"\ncommit id:"X"')).toBe(
      '"X" => **commit** `X`\n\nA later commit takes this id, so this one is not drawn.'
    );
    // A merge may not reuse an id: it is rejected and the earlier commit is drawn.
    expect(
      hover('gitGraph\ncommit id:"A"\nbranch dev\ncommit\ncheckout main\nmerge dev id:"A¦"')
    ).toBe(
      '"A" => **commit** `A`\n\nAn earlier commit has this id, so this merge is rejected and the earlier commit is drawn.'
    );
    // A merge that a later commit replaces is still the later commit's story (D264).
    expect(
      hover('gitGraph\nbranch dev\ncommit\ncheckout main\nmerge dev id:"M¦"\ncommit id:"M"')
    ).toBe('"M" => **commit** `M`\n\nA later commit takes this id, so this one is not drawn.');
    expect(hover('gitGraph\ncherry-pick id:"no¦pe"')).toBe(
      '"nope" => **commit** `nope`\n\nNo commit has this id.'
    );
  });
});
