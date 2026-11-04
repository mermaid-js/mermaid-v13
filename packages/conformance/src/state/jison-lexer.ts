/**
 * The v12 state lexer as an oracle (lexer-parity gate, parser-method §1): mermaid v12's own
 * `stateDiagram.jison` lexer, run on exactly the text v12's state parser received. We capture
 * that text by wrapping the shared lexer's `setInput` while the oracle parses, then re-run the
 * lexer on it with a fresh StateDB as `yy` (its `processId` action calls `yy.lexer.unput`).
 * Both `stateDiagram` and `stateDiagram-v2` share the one jison parser.
 */
// cspell:words unput
import { loadOracle } from '../oracle.ts';

export type JisonToken = [name: string, image: string];

interface JisonLexer {
  setInput(input: string, yy: unknown): void;
  lex(): number | string;
  yytext: string;
  /** The text not lexed yet (kept right by `unput`, unlike `matched`). */
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

export interface StateLexerOracle {
  /**
   * Tokens v12's lexer produced for `source` (front matter etc. removed as v12 did), or
   * undefined when v12 never ran the state lexer on it. A lexical error (or a lexer action
   * that throws) ends the list with `['ERROR', '']` (jison's own `INVALID` is a token).
   * v12 appended a `\n` to the text; a token whose match ends there has it taken off its
   * image, since that line break is not in the source.
   */
  tokens(source: string): Promise<JisonToken[] | undefined>;
  /** The exact text v12's state lexer received for `source`, or undefined. */
  input(source: string): Promise<string | undefined>;
}

let loading: Promise<StateLexerOracle> | undefined;

export function loadStateLexerOracle(): Promise<StateLexerOracle> {
  loading ??= load();
  return loading;
}

async function load(): Promise<StateLexerOracle> {
  const oracle = await loadOracle();
  const mermaid = ((await import('mermaid-v12')) as unknown as { default: MermaidV12 }).default;
  const probe = await mermaid.mermaidAPI.getDiagramFromText('stateDiagram-v2\n  A');
  const parser = probe.parser.parser;
  const StateDB = probe.db.constructor as new () => object;
  const lexer = parser.lexer;
  const setInput = lexer.setInput.bind(lexer);
  let captured: string | undefined;
  lexer.setInput = (input, yy) => {
    captured = input;
    setInput(input, yy);
  };
  const capture = async (source: string) => {
    captured = undefined;
    await oracle.parse(source);
    return captured as string | undefined;
  };
  return {
    input: capture,
    async tokens(source) {
      const input = await capture(source);
      if (input === undefined) return undefined;
      const yy = new StateDB() as { lexer?: JisonLexer };
      yy.lexer = lexer;
      setInput(input, yy);
      const out: JisonToken[] = [];
      for (;;) {
        let t: number | string;
        try {
          t = lexer.lex();
        } catch {
          out.push(['ERROR', '']);
          break;
        }
        if (t === 1) break; // $end
        const name = typeof t === 'number' ? (parser.terminals_[t] ?? String(t)) : t;
        const atEnd = lexer._input === '';
        const image =
          atEnd && lexer.yytext.endsWith('\n') ? lexer.yytext.slice(0, -1) : lexer.yytext;
        out.push([name, image]);
      }
      return out;
    },
  };
}
