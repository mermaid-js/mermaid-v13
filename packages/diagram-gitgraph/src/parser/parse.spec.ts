import { describe, expect, it } from 'vitest';
import { detectGitGraph, parseGitGraph } from './index.ts';
import type { GitGraphParseOptions } from './index.ts';

/**
 * The gitGraph parser and model (#370): v12's grammar and DB semantics, derived ids (D260),
 * duplicate ids (D264), title fields (D265), AST ids, symbols and spans. Accept/reject and model
 * parity over the corpus are the conformance suite's (`packages/conformance/src/gitgraph`).
 */
const parse = (src: string, options: GitGraphParseOptions = {}) => parseGitGraph(src, options);
const codes = (src: string, options: GitGraphParseOptions = {}) =>
  parse(src, options).diagnostics.map((d) => d.code);
const ids = (src: string) => parse(src).model.commits.map((c) => c.id);

describe('gitGraph parser', () => {
  it('reads commits on main with derived ids (D260)', () => {
    const { model, diagnostics } = parse('gitGraph\n  commit\n  commit id:"b" msg:"two"');
    expect(diagnostics).toEqual([]);
    expect(model.direction).toBe('LR');
    expect(model.commits).toEqual([
      {
        id: '0-9e3779b',
        customId: false,
        message: '',
        seq: 0,
        type: 'NORMAL',
        tags: [],
        parents: [],
        branch: 'main',
        astId: 'c#1',
      },
      {
        id: 'b',
        customId: true,
        message: 'two',
        seq: 1,
        type: 'NORMAL',
        tags: [],
        parents: ['0-9e3779b'],
        branch: 'main',
        astId: 'c:b',
      },
    ]);
    expect(model.branches).toEqual([{ name: 'main', order: 0, head: 'b' }]);
    expect(model).toMatchObject({ mainBranch: 'main', currentBranch: 'main', head: 'b' });
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.commits[0])).toBe(true);
    expect(Object.isFrozen(model.commits[0]?.parents)).toBe(true);
  });

  it('gives the same ids for the same text, and new ones per sequence number', () => {
    const src = 'gitGraph\ncommit\nbranch a\ncommit\ncheckout main\ncommit\nmerge a';
    expect(ids(src)).toEqual(ids(src));
    expect(ids(src)).toEqual(['0-9e3779b', '1-3c6ef36', '2-daa66d1', '3-78dde6c']);
    // A derived id keeps clear of every id written in the text, before or after it.
    expect(ids('gitGraph\ncommit\ncommit id:"0-9e3779b"')).toEqual(['0-9e1e461', '0-9e3779b']);
  });

  it('lets a cherry-pick name a derived id: only commit and merge ids are kept clear of', () => {
    const src = 'gitGraph\ncommit\nbranch b\ncommit\ncherry-pick id:"0-9e3779b"';
    expect(codes(src)).toEqual([]);
    expect(ids(src)).toEqual(['0-9e3779b', '1-3c6ef36', '2-daa66d1']);
    expect(
      ids('gitGraph\ncommit\nbranch b\ncommit\ncheckout main\nmerge b id:"0-9e3779b"')[0]
    ).toBe('0-9e1e461');
  });

  it('reads the headers v12 accepts, and the direction', () => {
    for (const [src, dir] of [
      ['gitGraph\ncommit', 'LR'],
      ['gitGraph:\ncommit', 'LR'],
      ['gitGraph :\ncommit', 'LR'],
      ['gitGraph TB:\ncommit', 'TB'],
      ['gitGraph BT :\ncommit', 'BT'],
      ['gitGraph LR:\ncommit', 'LR'],
      ['gitGraph commit', 'LR'],
      ['gitGraph TB: commit', 'TB'],
      ['\n\ngitGraph\n\ncommit\n\n', 'LR'],
    ] as const) {
      const { model, diagnostics } = parse(src);
      expect(diagnostics, src).toEqual([]);
      expect(model.direction, src).toBe(dir);
    }
    for (const src of ['gitGraph TB\ncommit', 'gitGraph:TB\ncommit', 'gitGraph\nTB:', 'gitgraph']) {
      expect(codes(src), src).toContain('UNEXPECTED');
    }
  });

  it('reads commit options in any order: the last id, message and type, every tag', () => {
    const { model, ast } = parse(
      'gitGraph\ncommit "a" msg:"b" tag:"1" id:"x" type:REVERSE tag:"" id:"y" type:HIGHLIGHT tag:"1"'
    );
    expect(model.commits[0]).toMatchObject({
      id: 'y',
      message: 'b',
      type: 'HIGHLIGHT',
      tags: ['1', '', '1'],
    });
    expect(ast.children[1]).toMatchObject({
      id: 'c:y',
      type: 'Commit',
      commitId: { value: 'y' },
      commitType: 'HIGHLIGHT',
    });
  });

  it('converts strings as Langium does and keeps text as written (D263)', () => {
    const { model } = parse(
      'gitGraph\ncommit id:\'a\\\'b\' msg:"x = y <b>\\n\\tz" tag:"<br>"\nbranch "q<br>r"'
    );
    expect(model.commits[0]).toMatchObject({
      id: "a'b",
      message: 'x = y <b>\n\tz',
      tags: ['<br>'],
    });
    expect(model.branches.map((b) => b.name)).toEqual(['main', 'q<br>r']);
  });

  it('creates and checks out branches; unordered ones are 0, ties keep creation order', () => {
    const { model } = parse(
      'gitGraph\ncommit\nbranch a order:3\nbranch b\nbranch c order:1\ncommit\nswitch a',
      { mainBranchOrder: 2 }
    );
    expect(model.branches.map((b) => [b.name, b.order, b.astId])).toEqual([
      ['b', 0, 'b:b'],
      ['c', 1, 'b:c'],
      ['main', 2, undefined],
      ['a', 3, 'b:a'],
    ]);
    expect(model.currentBranch).toBe('a');
    expect(model.head).toBe('0-9e3779b');
    expect(model.branches.find((b) => b.name === 'c')?.head).toBe('1-3c6ef36');
  });

  it('seeds the main branch from the config', () => {
    const { model } = parse('gitGraph\ncommit\nbranch a\ncheckout trunk', {
      mainBranchName: 'trunk',
    });
    expect(model.mainBranch).toBe('trunk');
    expect(model.currentBranch).toBe('trunk');
    expect(model.commits[0]?.branch).toBe('trunk');
    expect(codes('gitGraph\ncommit\ncheckout main', { mainBranchName: 'trunk' })).toEqual([
      'GIT_UNKNOWN_BRANCH',
    ]);
  });

  it('merges: parents [head, other head], MERGE with the written type, v12 message', () => {
    const { model } = parse(
      'gitGraph\ncommit id:"A"\nbranch dev\ncommit id:"B"\ncheckout main\ncommit id:"C"\nmerge dev tag:"t" type:REVERSE\nmerge dev id:"" '
    );
    expect(codes('gitGraph\ncommit\nbranch dev\ncommit\ncheckout main\nmerge dev id:""')).toEqual(
      []
    );
    const merge = model.commits[3];
    expect(merge).toMatchObject({
      id: '3-78dde6c',
      customId: false,
      message: 'merged branch dev into main',
      type: 'MERGE',
      customType: 'REVERSE',
      tags: ['t'],
      parents: ['C', 'B'],
      branch: 'main',
      astId: 'm:dev#1',
    });
  });

  it('cherry-picks: parents [head, source], the default tag, tag "" gives none', () => {
    const base =
      'gitGraph\ncommit id:"A" msg:"m"\nbranch b\ncommit id:"B"\ncheckout main\ncommit id:"C"\nmerge b id:"M"\nbranch x\ncommit\n';
    const pick = (line: string) => parse(base + line).model.commits.at(-1);
    expect(pick('cherry-pick id:"B"')).toMatchObject({
      type: 'CHERRY_PICK',
      parents: ['4-1715607', 'B'],
      tags: ['cherry-pick:B'],
      message: 'cherry-picked  into x',
      astId: 'cp:B#1',
    });
    expect(pick('cherry-pick id:"M" parent:"C"')?.tags).toEqual(['cherry-pick:M|parent:C']);
    expect(pick('cherry-pick id:"B" tag:"" tag:"z"')?.tags).toEqual(['z']);
    expect(pick('cherry-pick id:"A"')?.message).toBe('cherry-picked m into x');
  });

  it('reports each of v12 DB checks with its own code, and the statement changes nothing', () => {
    const cases: [string, string][] = [
      ['gitGraph\ncommit\nbranch main', 'GIT_BRANCH_EXISTS'],
      ['gitGraph\ncheckout nope', 'GIT_UNKNOWN_BRANCH'],
      ['gitGraph\ncommit\nbranch a\ncommit\ncheckout main\nmerge main', 'GIT_MERGE_INTO_ITSELF'],
      ['gitGraph\ncommit\nbranch a\nmerge a', 'GIT_MERGE_CURRENT_BRANCH'],
      ['gitGraph\nbranch a\ncommit\ncheckout main\nmerge a', 'GIT_MERGE_NO_COMMITS'],
      ['gitGraph\ncommit\nmerge nope', 'GIT_MERGE_UNKNOWN_BRANCH'],
      ['gitGraph\nbranch a\ncheckout main\ncommit\nmerge a', 'GIT_MERGE_EMPTY_BRANCH'],
      ['gitGraph\ncommit\nbranch a\ncheckout main\nmerge a', 'GIT_MERGE_SAME_HEAD'],
      [
        'gitGraph\ncommit id:"A"\nbranch a\ncommit\ncheckout main\nmerge a id:"A"',
        'GIT_MERGE_DUPLICATE_ID',
      ],
      ['gitGraph\ncommit\ncherry-pick id:"nope"', 'GIT_CHERRY_PICK_UNKNOWN_COMMIT'],
      [
        'gitGraph\ncommit id:"A"\nbranch a\ncommit\ncherry-pick id:"A" parent:"Z"',
        'GIT_CHERRY_PICK_NOT_A_PARENT',
      ],
      [
        'gitGraph\ncommit\nbranch a\ncommit\ncheckout main\ncommit\nmerge a id:"M"\nbranch b\ncommit\ncherry-pick id:"M"',
        'GIT_CHERRY_PICK_MERGE_PARENT',
      ],
      ['gitGraph\ncommit id:"A"\ncherry-pick id:"A"', 'GIT_CHERRY_PICK_SAME_BRANCH'],
      [
        'gitGraph\nbranch b\ncheckout main\ncommit id:"A"\ncheckout b\ncherry-pick id:"A"',
        'GIT_CHERRY_PICK_NO_COMMITS',
      ],
    ];
    for (const [src, code] of cases) {
      expect(codes(src), src).toEqual([code]);
      // The failed statement left the model as the text before it made it.
      const before = parse(src.slice(0, src.lastIndexOf('\n'))).model;
      const after = parse(src).model;
      expect(after.commits, src).toEqual(before.commits);
      expect(after.branches, src).toEqual(before.branches);
      expect(after.currentBranch, src).toBe(before.currentBranch);
    }
  });

  it('ranges a DB check on the offending argument', () => {
    const src = 'gitGraph\ncommit id:"A"\ncherry-pick id:"A"\ncheckout "nope"';
    const [same, unknown] = parse(src).diagnostics;
    expect(src.slice(same?.range.start, same?.range.end)).toBe('"A"');
    expect(src.slice(unknown?.range.start, unknown?.range.end)).toBe('"nope"');
  });

  it('keeps v12 duplicate ids (D264): the later commit replaces the earlier, with a warning', () => {
    const self = parse('gitGraph\ncommit id:"A"\ncommit id:"A"');
    expect(self.model.commits.map((c) => [c.id, c.parents, c.astId])).toEqual([
      ['A', ['A'], 'c:A@2'],
    ]);
    const [warning] = self.diagnostics;
    expect(warning).toMatchObject({ severity: 'warning', code: 'GIT_DUPLICATE_ID' });
    expect(warning?.range).toEqual({ start: 33, end: 36 });
    expect(warning?.related?.[0]?.range).toEqual({ start: 19, end: 22 });
    expect(self.model.warnings).toEqual([warning]);
    // A, B, A: the first A is gone, B's parent is the later A, whose parent is B (a cycle).
    // A third use still points at the first (D264).
    const third = parse('gitGraph\ncommit id:"A"\ncommit id:"A"\ncommit id:"A"').diagnostics;
    expect(third.map((d) => d.related?.[0]?.range)).toEqual([
      { start: 19, end: 22 },
      { start: 19, end: 22 },
    ]);
    const cycle = parse('gitGraph\ncommit id:"A"\ncommit id:"B"\ncommit id:"A"').model;
    expect(cycle.commits.map((c) => [c.id, c.seq, c.parents])).toEqual([
      ['B', 1, ['A']],
      ['A', 2, ['B']],
    ]);
  });

  it('draws the in-text title, else the front-matter one (D265); the last value wins', () => {
    expect(parse('gitGraph\ntitle  One  two \ntitle Last\ncommit').model.title).toBe('Last');
    expect(parse('---\ntitle: Front\n---\ngitGraph\ncommit').model.title).toBe('Front');
    expect(parse('---\ntitle: Front\n---\ngitGraph\ntitle In text').model.title).toBe('In text');
    expect(parse('gitGraph\ntitle\ncommit').model.title).toBeUndefined();
    const { model } = parse('gitGraph\naccTitle: a\naccDescr {\n  one\n    two\n}\naccTitle: b');
    expect([model.accTitle, model.accDescr]).toEqual(['b', 'one\ntwo']);
  });

  it('gives each statement its semantic AST id (spec "AST ids")', () => {
    const src = [
      'gitGraph TB:',
      'title t',
      'commit',
      'commit id:"A"',
      'branch dev',
      'commit',
      'checkout main',
      'merge dev',
      'checkout dev',
      'commit id:"A"',
      'checkout main',
      'commit id:"X"',
      'merge dev',
      'switch dev',
      'cherry-pick id:"X"',
      'branch "a#b"',
      'accTitle: x',
    ].join('\n');
    const { ast, diagnostics } = parse(src);
    expect(diagnostics.map((d) => d.code)).toEqual(['GIT_DUPLICATE_ID']);
    expect(ast.children.map((n) => n.id)).toEqual([
      'st:1',
      'st:2',
      'c#1',
      'c:A',
      'b:dev',
      'c#2',
      'co:main#1',
      'm:dev#1',
      'co:dev#1',
      'c:A@2',
      'co:main#2',
      'c:X',
      'm:dev#2',
      'co:dev#2',
      'cp:X#1',
      'b:a%23b',
      'st:3',
    ]);
    expect(ast.children[0]).toMatchObject({ type: 'Header', direction: 'TB' });
    const header = ast.children[0];
    expect(src.slice(header?.range.start, header?.range.end)).toBe('gitGraph TB:');
    const merge = ast.children[7];
    expect(src.slice(merge?.range.start, merge?.range.end)).toBe('merge dev');
  });

  it('records branch and commit symbols in separate namespaces, and statement spans', () => {
    const src =
      'gitGraph\ncommit id:"dev"\nbranch dev\ncommit\ncheckout main\nmerge dev id:"M"\nbranch x\ncherry-pick id:"M" parent:"dev"';
    const { symbols, statements } = parse(src);
    expect(
      symbols.map((s) => [s.kind, s.name, s.role, src.slice(s.range.start, s.range.end)])
    ).toEqual([
      ['commit', 'dev', 'def', '"dev"'],
      ['branch', 'dev', 'def', 'dev'],
      ['branch', 'main', 'ref', 'main'],
      ['branch', 'dev', 'ref', 'dev'],
      ['commit', 'M', 'def', '"M"'],
      ['branch', 'x', 'def', 'x'],
      ['commit', 'M', 'ref', '"M"'],
      ['commit', 'dev', 'ref', '"dev"'],
    ]);
    expect(statements.map((s) => s.kind)).toEqual([
      'header',
      'commit',
      'branch',
      'commit',
      'checkout',
      'merge',
      'branch',
      'cherryPick',
    ]);
  });

  it('rejects names that need quotes, suggesting them (D269)', () => {
    for (const [src, quoted] of [
      ['gitGraph\nbranch titled', '"titled"'],
      ['gitGraph\nbranch 123', '"123"'],
      ['gitGraph\nbranch commit', '"commit"'],
    ] as const) {
      const [d] = parse(src).diagnostics;
      expect(d?.code, src).toBe('UNEXPECTED');
      expect(d?.message, src).toContain(quoted);
    }
    expect(codes('gitGraph\nbranch "titled"\nbranch "123"\nbranch "commit"')).toEqual([]);
  });

  it('detects gitGraph as v12 did', () => {
    expect(detectGitGraph('gitGraph\ncommit')).toBe(true);
    expect(detectGitGraph('%%{init: {}}%%\n%% c\n  gitGraph TB:')).toBe(true);
    expect(detectGitGraph('---\ntitle: x\n---\ngitGraphx')).toBe(true);
    expect(detectGitGraph('gitgraph')).toBe(false);
    expect(detectGitGraph('graph TD')).toBe(false);
  });
});

describe('gitGraph probe (R-LANG-7)', () => {
  /** The probe's mode at `¦`. */
  const mode = (marked: string) => {
    const at = marked.indexOf('¦');
    const src = marked.slice(0, at) + marked.slice(at + 1);
    return parse(src, { probe: at }).probe?.mode;
  };

  it('names what the offset is in: code, a string or a statement value', () => {
    expect(mode('gitGraph\ncommit ¦')).toBe('INITIAL');
    expect(mode('gitGraph\ncommit msg:"a¦b"')).toBe('string');
    expect(mode('gitGraph\ncommit msg:"ab"¦')).toBe('INITIAL');
    expect(mode('gitGraph\ntitle Re¦lease')).toBe('title');
    expect(mode('gitGraph\naccTitle: x¦')).toBe('accTitle');
    expect(mode('gitGraph\naccDescr {\n  x¦\n}')).toBe('accDescr');
    expect(mode('gitGraph\naccDescr {\n  x\n}¦')).toBe('INITIAL');
    expect(mode('gitGraph\n%% c¦')).toBe('comment');
  });

  it('is in a string to the end of the line after an unclosed quote', () => {
    // The lexer makes the quote alone an error token and reads on after it.
    expect(mode('gitGraph\ncherry-pick id:"¦')).toBe('string');
    expect(mode('gitGraph\ncherry-pick id:"a¦')).toBe('string');
    expect(mode("gitGraph\ncherry-pick id:'a b¦\ncommit")).toBe('string');
    expect(mode('gitGraph\ncherry-pick id:"a\ncommit¦')).toBe('INITIAL');
  });
});

describe('gitGraph cherry-pick without an id', () => {
  it('reports where the id is still to be written, after the statement and its blanks', () => {
    for (const [src, at] of [
      ['gitGraph\ncommit\ncherry-pick', 27],
      ['gitGraph\ncommit\ncherry-pick  \ncommit', 29],
      ['gitGraph\ncommit\ncherry-pick tag:"x" ', 36],
    ] as const) {
      const [d] = parse(src).diagnostics;
      expect(d?.code, src).toBe('GIT_CHERRY_PICK_UNKNOWN_COMMIT');
      expect(d?.range, src).toEqual({ start: at, end: at });
    }
  });
});
