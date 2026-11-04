/**
 * The v12 ER lexer as an oracle (lexer-parity gate, port-diagram/parser-method.md §1):
 * v12's own `erDiagram.jison` lexer (mermaid 12.2.0), run on exactly the text v12's ER parser received.
 * We capture that text by wrapping the shared lexer's `setInput` while the oracle parses, then
 * re-run the lexer on it with a fresh ErDB as `yy`.
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

export interface ErLexerOracle {
  /**
   * Tokens v12's lexer produced for `source` (front matter, directives and comments removed as
   * v12 did), or undefined when v12 never ran the ER lexer on it. A lexical error ends the
   * list with `['INVALID', '']`. The trailing `$end` is dropped; jison's `EOF` terminal stays.
   */
  tokens(source: string): Promise<JisonToken[] | undefined>;
  /** The exact text v12's ER lexer received for `source`, or undefined. */
  input(source: string): Promise<string | undefined>;
}

let loading: Promise<ErLexerOracle> | undefined;

export function loadErLexerOracle(): Promise<ErLexerOracle> {
  loading ??= load();
  return loading;
}

async function load(): Promise<ErLexerOracle> {
  const oracle = await loadOracle();
  const mermaid = ((await import('mermaid-v12')) as unknown as { default: MermaidV12 }).default;
  const probe = await mermaid.mermaidAPI.getDiagramFromText('erDiagram\n  A');
  const parser = probe.parser.parser;
  const ErDB = probe.db.constructor as new () => object;
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
    // Set by the wrapped setInput during the parse.
    return captured as string | undefined;
  };
  return {
    input: capture,
    async tokens(source) {
      const input = await capture(source);
      if (input === undefined) return undefined;
      setInput(input, new ErDB());
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
