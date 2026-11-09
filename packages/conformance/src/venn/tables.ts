/** venn's rows in the shared oracle tables (`src/tables.ts`). */
import type { JisonTypeDescriptor, JisonYyContext } from '../jison/types.ts';
import { startsWith, V12_DIAGRAMS } from '../jison/types.ts';

/**
 * A fresh `yy` for one run of venn's lexer. `venn.jison`'s lexer reads the DB's indent mode
 * (`yy.getIndentMode()`, an indented `text` is `INDENT_TEXT` only while it is on), turns it
 * off itself at a line that starts with a non-blank (`yy.setIndentMode(false)`), and keeps
 * `yy.consumeIndentText` on `yy`. Only the parser turns the mode on: the actions of every
 * `set` and `union` statement. This `yy` plays that part: the mode is on from each `SET` or
 * `UNION` token. The mode is read only at a line start, which a reduced statement's action
 * always runs before, so the two differ only after a parse error, where v12 lexes no further.
 * The DB's own module state is never touched, so runs do not leak into each other.
 * `venn/yy-emulation.spec.ts` checks it against the stream v12's parser pulls.
 */
function vennYy({ onToken }: JisonYyContext): unknown {
  let indent = false;
  onToken((name) => {
    if (name === 'SET' || name === 'UNION') indent = true;
  });
  return {
    getIndentMode: () => indent,
    setIndentMode: (on: boolean) => {
      indent = on;
    },
  };
}

/** Its row of the jison lexer oracle and harvest (D212). */
export const jison = {
  venn: {
    probe: 'venn-beta\n  set A',
    yy: vennYy,
    e2e: ['venn'],
    harvest: {
      dir: `${V12_DIAGRAMS}/venn`,
      docs: 'venn.md',
      method: { kind: 'literals', header: startsWith('venn-beta') },
    },
  },
} satisfies Record<string, JisonTypeDescriptor>;
