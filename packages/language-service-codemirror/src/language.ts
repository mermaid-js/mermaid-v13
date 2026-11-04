/**
 * The Lezer language: the highlighting grammar gen-grammar generates from the flowchart
 * grammar file (#21), built with lezer-generator (`src/generated/`, `pnpm … gen`).
 *
 * The generated grammar does not model front matter (GAPS, found by #28): a `'` or `(` in the
 * YAML would leave a label mode open into the diagram. The parser here hides the front matter
 * from it: the block (as core's `preprocess` finds it, `bodyStart`) reads as blanks, line
 * breaks kept, so every position stays where it is and the diagram starts in the initial mode.
 */
import {
  defineLanguageFacet,
  Language,
  LanguageSupport,
  languageDataProp,
} from '@codemirror/language';
import { Parser } from '@lezer/common';
import type { Input, PartialParse, Tree, TreeFragment } from '@lezer/common';
import { preprocess } from '@mermaid-js/core/preprocess';
import { parser as flowchartParser } from './generated/flowchart.parser.js';

/** The input with `[0, end)` read as spaces, line breaks kept. */
class BlankedInput implements Input {
  readonly lineChunks = false;
  constructor(
    private readonly inner: Input,
    private readonly end: number
  ) {}
  get length(): number {
    return this.inner.length;
  }
  chunk(from: number): string {
    if (from >= this.end) return this.inner.chunk(from);
    return this.read(from, this.end);
  }
  read(from: number, to: number): string {
    if (from >= this.end) return this.inner.read(from, to);
    const cut = Math.min(to, this.end);
    const head = this.inner.read(from, cut).replace(/[^\n\r]/g, ' ');
    return cut < to ? head + this.inner.read(cut, to) : head;
  }
}

/** The front matter's end each tree was parsed with (in that tree's positions). */
const parsedWith = new WeakMap<Tree, number>();

/**
 * Whether a fragment reads the same with the front matter ending at `end`: each position in
 * it is blank in both parses or in neither. An edit before a fragment shifts the old end and
 * the fragment alike (`offset`), so a front-matter keystroke keeps the diagram's fragments.
 */
function reusable(f: TreeFragment, end: number): boolean {
  const old = parsedWith.get(f.tree);
  if (old === undefined) return false;
  const oldEnd = old - f.offset; // in the new document's positions
  return oldEnd === end || f.to <= Math.min(oldEnd, end) || f.from >= Math.max(oldEnd, end);
}

class FrontMatterParser extends Parser {
  constructor(private readonly inner: Parser) {
    super();
  }

  createParse(
    input: Input,
    fragments: readonly TreeFragment[],
    ranges: readonly { from: number; to: number }[]
  ): PartialParse {
    const end = preprocess(input.read(0, input.length)).bodyStart;
    const parse = this.inner.createParse(
      end > 0 ? new BlankedInput(input, end) : input,
      fragments.filter((f) => reusable(f, end)),
      ranges
    );
    return {
      get parsedPos() {
        return parse.parsedPos;
      },
      get stoppedAt() {
        return parse.stoppedAt;
      },
      stopAt: (pos) => parse.stopAt(pos),
      advance: () => {
        const tree = parse.advance();
        if (tree) parsedWith.set(tree, end);
        return tree;
      },
    };
  }
}

const data = defineLanguageFacet({ commentTokens: { line: '%%' } });

/** The Mermaid language (flowchart grammar), with no highlighting in the front matter. */
export const mermaidLanguageDefinition = new Language(
  data,
  // The top node carries the language data (completion source, comment tokens), as
  // `LRLanguage.define` does for a plain LR parser.
  new FrontMatterParser(
    flowchartParser.configure({ props: [languageDataProp.add({ Document: data })] })
  ),
  [],
  'mermaid'
);

/** Highlighting only: the Lezer language as a CodeMirror `LanguageSupport`. */
export function mermaidLanguage(): LanguageSupport {
  return new LanguageSupport(mermaidLanguageDefinition);
}
