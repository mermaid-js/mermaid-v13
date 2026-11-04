/**
 * The v12 sequence lexer as an oracle (lexer-parity gate, parser-method §1): v12's own
 * jison lexer, run on exactly the text v12's sequence parser received. We capture that text by
 * wrapping the shared lexer's `setInput` while the oracle parses, then re-run the lexer on it
 * with a fresh SequenceDB as `yy`. Copied from the flowchart oracle.
 *
 * Calls must be sequential (await each one before the next): the captured text is one
 * variable shared by every call, and v12's parser is a single shared instance.
 */
import { loadOracle } from '../oracle.ts';

export type JisonToken = [name: string, image: string];

/** The name the oracle gives the point where jison threw (no rule matched); it stops there. */
export const LEXICAL_ERROR = 'LEXICAL_ERROR';

interface JisonLexer {
  setInput(input: string, yy: unknown): void;
  lex(): number | string;
  yytext: string;
  /** The input not yet matched. */
  _input: string;
}
interface JisonParser {
  lexer: JisonLexer;
  terminals_: Record<number, string>;
}
interface MermaidV12 {
  mermaidAPI: {
    getDiagramFromText(text: string): Promise<{ parser: { parser: JisonParser }; db: object }>;
  };
}

export interface SequenceLexerOracle {
  /**
   * Tokens v12's lexer produced for `source` (front matter etc. removed as v12 did), or
   * undefined when v12 never ran the sequence lexer on it. A lexical error ends the list
   * with `[LEXICAL_ERROR, '']`. The `\n` v12 appended to the text is taken off the image of
   * the token that matched it (none when a skipped blank run took it), so images are
   * clipped to the source as v13's are.
   */
  tokens(source: string): Promise<JisonToken[] | undefined>;
  /** The exact text v12's sequence lexer received for `source`, or undefined. */
  input(source: string): Promise<string | undefined>;
}

let loading: Promise<SequenceLexerOracle> | undefined;

export function loadSequenceLexerOracle(): Promise<SequenceLexerOracle> {
  loading ??= load();
  return loading;
}

async function load(): Promise<SequenceLexerOracle> {
  const oracle = await loadOracle();
  const mermaid = ((await import('mermaid-v12')) as unknown as { default: MermaidV12 }).default;
  const probe = await mermaid.mermaidAPI.getDiagramFromText('sequenceDiagram\n  A->>B: x');
  const parser = probe.parser.parser;
  const SequenceDB = probe.db.constructor as new () => object;
  const lexer = parser.lexer;
  const setInput = lexer.setInput.bind(lexer);
  let captured: string | undefined;
  lexer.setInput = (input, yy) => {
    captured = input;
    setInput(input, yy);
  };
  const reset = () => {
    captured = undefined;
  };
  const capture = async (source: string) => {
    reset();
    await oracle.parse(source);
    return captured;
  };
  return {
    input: capture,
    async tokens(source) {
      const input = await capture(source);
      if (input === undefined) return undefined;
      setInput(input, new SequenceDB());
      const out: JisonToken[] = [];
      let clipped = false;
      for (;;) {
        let t: number | string;
        try {
          t = lexer.lex();
        } catch {
          out.push([LEXICAL_ERROR, '']);
          break;
        }
        if (t === 1) break; // $end
        let image = lexer.yytext;
        if (!clipped && lexer._input === '') {
          clipped = true;
          if (image.endsWith('\n')) image = image.slice(0, -1);
        }
        out.push([typeof t === 'number' ? (parser.terminals_[t] ?? String(t)) : t, image]);
      }
      return out;
    },
  };
}
