/**
 * What the sequence oracle needs that Node lacks. Two `SequenceDB` methods read the DOM, so
 * they threw ("window is not defined", "document is not defined") under the oracle:
 * - `parseBoxData` checks a box colour with `window.CSS.supports('color', …)`. It is replaced
 *   by v12's own code (DB:394–416) where the browser's answer comes from a colour parser;
 * - `addDetails` reads the menu JSON from the page element named by `details A: <id>`. It is
 *   replaced by what v12 did in a page without that element: nothing (the JSON read failed
 *   and was only logged). v13 keeps the element id on the AST for the interactions plugin.
 * Nothing else changes; the DB constructor binds `parseBoxData` from the prototype and
 * `apply` calls `addDetails` on it, so the patch reaches every DB the oracle makes.
 */
import { parseColor } from '@mermaid-js/core/theme';

/** `CSS.supports('color', c)` as a browser answers it for what v12 passes. */
const supportsColor = (c: string): boolean =>
  parseColor(c) !== undefined || /^(?:currentcolor|inherit|initial|unset|revert)$/i.test(c);

interface SequenceDbPrototype {
  extractWrap(text?: string): { cleanedText?: string; wrap?: boolean };
  parseBoxData(str: string): { text?: string; color: string; wrap?: boolean };
  addDetails(actorId: string, text: { text: string }): void;
  getActor(id: string): unknown;
}

interface MermaidV12 {
  mermaidAPI: {
    getDiagramFromText(text: string): Promise<{ db: unknown }>;
  };
}

export async function patchSequenceOracle(mermaid: MermaidV12): Promise<void> {
  const probe = await mermaid.mermaidAPI.getDiagramFromText('sequenceDiagram\n  A->>B: x');
  const proto = Object.getPrototypeOf(probe.db as object) as SequenceDbPrototype;
  proto.parseBoxData = function (this: SequenceDbPrototype, str: string) {
    const match = /^((?:rgba?|hsla?)\s*\(.*\)|\w*)(.*)$/.exec(str);
    let color = match?.[1] ? match[1].trim() : 'transparent';
    let title = match?.[2] ? match[2].trim() : undefined;
    if (!supportsColor(color)) {
      color = 'transparent';
      title = str.trim();
    }
    const { wrap, cleanedText } = this.extractWrap(title);
    // v12 ran `sanitizeText` here; under the oracle (DOMPurify patched, `strict`) it is identity.
    return { text: cleanedText ? cleanedText : undefined, color, wrap };
  };
  proto.addDetails = function (this: SequenceDbPrototype, actorId: string) {
    this.getActor(actorId);
  };
}
