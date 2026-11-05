/**
 * The Lezer language: first-paint highlighting per diagram type (D134). Each type's parser is
 * built from the highlighting grammar gen-grammar generates from its grammar file (#21) with
 * lezer-generator (`src/generated/`, `pnpm … gen`) and imported on first use, so a page that
 * edits only flowcharts loads no other type's parser. The parser runs on the detected type
 * (as the service detects first-party types) and re-picks when an edit changes it. A type with
 * no row in {@link LEZER_HIGHLIGHTERS}, or whose parser is still loading, gets an empty tree:
 * semantic tokens only, never another type's colours.
 *
 * The generated tokenizers read a leading front matter block themselves, as the Monarch and
 * TextMate grammars do (fences meta, YAML keys variables), so YAML never leaves a diagram mode
 * open into the diagram.
 */
import {
  defineLanguageFacet,
  Language,
  LanguageSupport,
  languageDataProp,
  ParseContext,
} from '@codemirror/language';
import { NodeType, Parser, Tree } from '@lezer/common';
import type { Input, PartialParse, TreeFragment } from '@lezer/common';
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import { firstPartyFacets } from '@mermaid-js/language-service';
import type { FirstPartyFacetId } from '@mermaid-js/language-service';
import { LEZER_HIGHLIGHTERS } from './grammars.ts';

export { LEZER_HIGHLIGHTERS } from './grammars.ts';

/** Whether `id` has a row in {@link LEZER_HIGHLIGHTERS}. */
const highlighted = (id: string): id is FirstPartyFacetId => Object.hasOwn(LEZER_HIGHLIGHTERS, id);

const data = defineLanguageFacet({ commentTokens: { line: '%%' } });

/** Loaded parsers, the top node carrying the language data, by diagram id. */
const loaded = new Map<string, Parser>();
const loading = new Map<string, Promise<void>>();
/** Ids whose import failed: uncoloured until `loadHighlighter` is called again. */
const failed = new Set<string>();

/**
 * Load the first-paint parser of diagram `id` (`flowchart`). Editors load it themselves when a
 * text of the type shows up; a host can call this to have it before the first paint. Resolves
 * at once for an id with no row. A failed import leaves the type uncoloured (editors do not
 * retry it) until the next call of this function.
 */
export function loadHighlighter(id: string): Promise<void> {
  const load = highlighted(id) ? LEZER_HIGHLIGHTERS[id] : undefined;
  if (!load || loaded.has(id)) return Promise.resolve();
  let started = loading.get(id);
  if (!started) {
    failed.delete(id);
    started = load()
      .then((parser) => {
        // The top node carries the language data (completion source, comment tokens), as
        // `LRLanguage.define` does for a plain LR parser.
        loaded.set(id, parser.configure({ props: [languageDataProp.add({ Document: data })] }));
      })
      .catch(() => {
        failed.add(id);
      })
      .finally(() => loading.delete(id));
    loading.set(id, started);
  }
  return started;
}

/** The diagram id of `text` as the service detects first-party types, or `undefined`. */
function detectId(
  text: string,
  bodyStart: number,
  pre: ReturnType<typeof preprocess>
): string | undefined {
  if (bodyStart >= text.length) return undefined;
  const body = text.slice(diagramStart(text, pre));
  return firstPartyFacets.find((e) => {
    try {
      return e.detector(body);
    } catch {
      return false;
    }
  })?.id;
}

/** The diagram id and front matter's end each tree was parsed with (in its positions). */
const parsedWith = new WeakMap<Tree, { readonly id: string; readonly end: number }>();

/**
 * Whether a fragment reads the same as a parse of diagram `id` with the front matter ending
 * at `end`: it came from the same type's parser, and each position in it is front matter in
 * both parses or in neither (the tokenizer's context is not checked on reuse, so a fence
 * typed or deleted would otherwise keep the old reading past it). An edit before a fragment
 * shifts the old end and the fragment alike (`offset`), so a front-matter keystroke keeps the
 * diagram's fragments.
 */
function reusable(f: TreeFragment, id: string, end: number): boolean {
  const old = parsedWith.get(f.tree);
  if (old?.id !== id) return false;
  const oldEnd = old.end - f.offset; // in the new document's positions
  return oldEnd === end || f.to <= Math.min(oldEnd, end) || f.from >= Math.max(oldEnd, end);
}

/** The tree of a text with no first-paint colours: its top node keeps the language data. */
const emptyTop = NodeType.define({
  id: 0,
  name: 'Document',
  top: true,
  props: [[languageDataProp, data]],
});

/** A parse that returns an empty tree of `length` at once. */
function done(length: number): PartialParse {
  return {
    parsedPos: length,
    stoppedAt: null,
    stopAt: () => undefined,
    advance: () => new Tree(emptyTop, [], [], length),
  };
}

class MermaidParser extends Parser {
  createParse(
    input: Input,
    fragments: readonly TreeFragment[],
    ranges: readonly { from: number; to: number }[]
  ): PartialParse {
    const text = input.read(0, input.length);
    const pre = preprocess(text);
    const end = pre.bodyStart;
    const id = detectId(text, end, pre);
    const inner = id === undefined ? undefined : loaded.get(id);
    if (id === undefined || !inner) {
      if (id === undefined || !highlighted(id) || failed.has(id)) {
        return done(input.length);
      }
      // Still loading: an empty tree now, and a re-parse once the parser is in (the skipping
      // parser schedules it in an editor view).
      const skip = ParseContext.getSkippingParser(loadHighlighter(id)).createParse(
        input,
        fragments,
        ranges
      );
      return {
        get parsedPos() {
          return skip.parsedPos;
        },
        stoppedAt: null,
        stopAt: () => undefined,
        advance: () => {
          const tree = skip.advance();
          return tree && new Tree(emptyTop, [], [], tree.length);
        },
      };
    }
    const parse = inner.createParse(
      input,
      fragments.filter((f) => reusable(f, id, end)),
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
        if (tree) parsedWith.set(tree, { id, end });
        return tree;
      },
    };
  }
}

/** The Mermaid language: per-type first-paint highlighting. */
export const mermaidLanguageDefinition = new Language(data, new MermaidParser(), [], 'mermaid');

/** Highlighting only: the Lezer language as a CodeMirror `LanguageSupport`. */
export function mermaidLanguage(): LanguageSupport {
  return new LanguageSupport(mermaidLanguageDefinition);
}
