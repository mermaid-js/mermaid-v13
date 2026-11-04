/**
 * The small Markdown the service writes (hover and completion docs): paragraphs split by
 * blank lines, `code` spans (with any number of backticks, as the service fences a label
 * that holds one) and **bold** spans, `- ` list lines. Built with text nodes only, so nothing
 * in a diagram's text can become markup.
 */
import { inlineMarkdown } from '@mermaid-js/language-service';

function inline(parent: HTMLElement, text: string): void {
  for (const part of inlineMarkdown(text)) {
    if (part.kind === 'code') {
      parent.appendChild(document.createElement('code')).textContent = part.text;
    } else if (part.kind === 'strong') {
      parent.appendChild(document.createElement('strong')).textContent = part.text;
    } else {
      parent.appendChild(document.createTextNode(part.text));
    }
  }
}

/** Render the service's Markdown into a `<div>`. */
export function renderMarkdown(markdown: string): HTMLElement {
  const root = document.createElement('div');
  for (const block of markdown.split(/\n\s*\n/)) {
    const lines = block.split('\n');
    if (lines.every((l) => l.startsWith('- '))) {
      const list = root.appendChild(document.createElement('ul'));
      for (const l of lines) inline(list.appendChild(document.createElement('li')), l.slice(2));
    } else {
      inline(root.appendChild(document.createElement('p')), lines.join(' '));
    }
  }
  return root;
}
