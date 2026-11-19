# Decisions, one file each

A decision made after D632 is a file in this folder, named after its id: `D636.md`. Decisions D1 to D632 are rows in [../DECISIONS.md](../DECISIONS.md), which is closed: it gets no new rows.

One file each, because every row added to one table is a merge conflict with every other open PR that adds one. Two PRs that add two files do not conflict.

## Adding a decision

1. Take the next free id: one more than the highest `D<n>.md` here. Look at the open PRs too, since one of them may have taken it already.
2. Create `D<n>.md` in this folder:

   ```markdown
   # D636: Decisions are one file each

   What was decided, in full sentences. Name what it amends or replaces by id (D435, D572).

   (Knut, 2026-11-19, spec #941.)
   ```

3. Cite it as `D636` wherever the decision applies, as before.

There is no index to update. The folder listing is the index.

## When two PRs take the same id

Both add the same file, so the second one to merge shows a conflict on that file alone. Rename yours to the next free id and update the places that cite it.

## Changing a decision

A decision is not edited after it is merged. A later decision replaces it and says so; add a line to the old one that points to the new one (`Replaced by D650.`). For a row in `DECISIONS.md`, the new file names the row it replaces and the row stays as it is.

`tools/workspace/decisions.spec.ts` checks the file names, the headings, and that `DECISIONS.md` stays closed.
