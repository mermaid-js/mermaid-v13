// cspell:words mathbb mathcal mathfrak boldsymbol widehat
/**
 * The math corpus for spike M1 #244, shared by `engine.spec.ts` and `spike-evidence.ts`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The math corpus (02-v12-math.md): every `$$…$$` span in e2e/diagrams/katex/**, found with
// v12's own regex, and the sequence `$$` strings from diagram-sequence's parser specs.
const KATEX_DIR = fileURLToPath(new URL('../../../e2e/diagrams/katex/pr-check/', import.meta.url));
const V12_MATH = /\$\$(.*?)\$\$/g;
const diagram = (source: string) => source.replace(/^---\n[\s\S]*?\n---\n/, '');
export const katex = readdirSync(KATEX_DIR)
  .filter((f) => f.endsWith('.mmd'))
  .sort()
  .flatMap((f) =>
    // The diagram only: the front matter's description quotes some of the TeX again.
    [...diagram(readFileSync(join(KATEX_DIR, f), 'utf8')).matchAll(V12_MATH)].map(
      (m) => m[1] as string
    )
  );
export const sequence = ['x^2', '\\alpha', 'x', 'y', 'z'];
export const corpus = [...katex, ...sequence];

/** Constructs the corpus lacks: strokes, rules, stretched and clipped glyphs, colour. */
export const extra = [
  '\\cancel{x}',
  '\\boxed{a+b}',
  '\\sqrt[3]{x^2+1}',
  // Long enough that MathJax stretches the arrow with a clipped, scaled left-arrow glyph.
  '\\xrightarrow{abcdefgh}',
  '\\overbrace{a+b+c}^{n}',
  '\\underbrace{x+y}_{2}',
  '\\widehat{abc}',
  '\\left(\\frac{\\frac{a}{b}}{\\frac{\\frac{c}{d}}{\\frac{e}{f}}}\\right)',
  '\\left\\{\\begin{matrix}1\\\\2\\\\3\\\\4\\\\5\\\\6\\end{matrix}\\right.',
  '\\enclose{circle}{x}',
  '{\\color{red}x}+y',
  '\\mathbb{R}\\mathcal{L}\\mathfrak{g}\\boldsymbol{\\alpha}',
];
