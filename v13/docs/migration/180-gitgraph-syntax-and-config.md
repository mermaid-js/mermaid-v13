## gitGraph syntax and config

- **SVG only:** `gitGraph`, `gitGraph LR:`, `gitGraph TB:` and `gitGraph BT:` are detected by
  v12's case-sensitive `gitGraph` detector, after `timeline` and before `stateDiagram`.
  `format: 'ascii'` throws `UnsupportedFormatError` (D216).
- **Commit ids are derived, not random** (D260). A commit with no `id:` is still
  `<seq>-<7 hex digits>`, but the digits come from a fixed hash of the sequence number instead
  of `Math.random`, so the same text gives the same ids and the same SVG on every render. A
  derived id never takes an id that a `commit` or `merge` writes anywhere in the text.
- **Text is drawn as written** (D263). v12 stored `<`, `>` and `=` in ids, messages, tags and
  branch names as `&lt;`, `&gt;` and `&equals;` and broke branch names on `<br>`; v13 keeps the
  source text, escapes it in the SVG, and breaks a branch name only on a newline. Labels are
  plain text (D268): `$$…$$` and `fa:` stay as written, as in v12.
- **A repeated commit id** keeps v12's model (D264): the later commit replaces the earlier and
  lists itself as a parent. v13 warns `GIT_DUPLICATE_ID` on the second id, with the first as a
  related location, and draws no arrow for the self-parent. Where the repeat makes a parent
  cycle (`A`, `B`, `A`), only parents written earlier count for `parallelCommits`, and a commit
  with none is placed as a root; v12 threw in BT with `parallelCommits` and placed such commits
  differently from pass to pass elsewhere.
- **Branch names starting with `title`** are rejected, as in v12, with a hint to quote them
  (D269). A statement with a syntax error changes nothing; one that breaks a rule (an unknown
  branch, a merge of a branch into itself, …) keeps its place in the text but changes nothing
  either, and its error message is v13's own wording.
- **Titles are drawn** (D265): the in-text `title` and a front-matter `title` (the in-text one
  wins), 18 px in `textColor`, `gitGraph.titleTopMargin` above the drawing.
- **Overlapping branch labels are moved apart.** Where v12 drew branch labels over each other
  (TB and BT: a long name after a short one, since v12 spaces lanes by the previous name only;
  LR: names of four or more lines), the lane moves out until the boxes are 10 px apart.
  Elsewhere every position is v12's. In TB with a redux theme the branch name sits 1 px lower
  than v12's.
- **Arrows are drawn in commit order**; v12 used its commit map's insertion order, which differs
  only for repeated ids.
- **The default theme is `redux-color`** (D151): a v12 diagram without a `theme` drew in
  `default`. Add `theme: 'default'` for v12's look. `look` is ignored, with one `LOOK_REMOVED`
  warning (D153): the redux themes carry v12's `look: neo` gitGraph geometry and colours, the
  classic themes v12 classic, and `neo` / `neo-dark` classic geometry with the neo colours, as
  v12 drew them (D266). Each difference is a theme variable ([Theme geometry](#theme-geometry)).
- **Honoured** in the `gitGraph` section, with v12's defaults: `titleTopMargin` (25),
  `diagramPadding` (8), `mainBranchName` (`main`), `mainBranchOrder` (0), `showCommitLabel`,
  `showBranches`, `rotateCommitLabel` (true), `parallelCommits` (false) and `useMaxWidth` (true).
  A `titleTopMargin` or `diagramPadding` that is not a number of at least 0 draws with the
  default and a `GIT_CONFIG_IGNORED` warning. The language service reads `mainBranchName` and
  `mainBranchOrder` from the document's front matter and `init` directives; renaming the main
  branch is refused there, as its name is config, not text.
- **Ignored**, as v12's gitGraph never read them: `nodeLabel`, `arrowMarkerAbsolute` and
  `useWidth`.
