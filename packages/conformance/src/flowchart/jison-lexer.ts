/**
 * The v12 flowchart lexer as an oracle (lexer-parity gate, notes/07): mermaid@12's own jison
 * lexer, run on exactly the text v12's flowchart parser received. We capture that text by
 * wrapping the shared lexer's `setInput` while the oracle parses, then re-run the lexer on it
 * with a fresh FlowDB as `yy` (its actions call `yy.lex.firstGraph()`).
 */
import { loadOracle } from '../oracle.ts';

export type JisonToken = [name: string, image: string];

interface JisonLexer {
  setInput(input: string, yy: unknown): void;
  lex(): number | string;
  yytext: string;
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

export interface FlowLexerOracle {
  /**
   * Tokens v12's lexer produced for `source` (front matter etc. removed as v12 did), or
   * undefined when v12 never ran the flowchart lexer on it. A lexical error ends the list
   * with `['INVALID', '']`.
   */
  tokens(source: string): Promise<JisonToken[] | undefined>;
  /** The exact text v12's flowchart lexer received for `source`, or undefined. */
  input(source: string): Promise<string | undefined>;
}

let loading: Promise<FlowLexerOracle> | undefined;

export function loadFlowLexerOracle(): Promise<FlowLexerOracle> {
  loading ??= load();
  return loading;
}

async function load(): Promise<FlowLexerOracle> {
  const oracle = await loadOracle();
  const mermaid = ((await import('mermaid-v12')) as unknown as { default: MermaidV12 }).default;
  const probe = await mermaid.mermaidAPI.getDiagramFromText('flowchart TD\n  A');
  const parser = probe.parser.parser;
  const FlowDB = probe.db.constructor as new () => object;
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
    return captured;
  };
  return {
    input: capture,
    async tokens(source) {
      const input = await capture(source);
      if (input === undefined) return undefined;
      setInput(input, new FlowDB());
      const out: JisonToken[] = [];
      for (;;) {
        let t: number | string;
        try {
          t = lexer.lex();
        } catch {
          out.push(['INVALID', '']);
          break;
        }
        if (t === 1) break; // $end
        out.push([typeof t === 'number' ? (parser.terminals_[t] ?? String(t)) : t, lexer.yytext]);
      }
      return out;
    },
  };
}
