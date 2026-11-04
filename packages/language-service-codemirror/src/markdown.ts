/**
 * The small Markdown the service writes (hover and completion docs): paragraphs split by
 * blank lines, `code` and **bold** spans, `- ` list lines. Built with text nodes only, so
 * nothing in a diagram's text can become markup.
 */

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*)/;

function inline(parent: HTMLElement, text: string): void {
  for (const part of text.split(INLINE)) {
    if (part === '') continue;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
      parent.appendChild(document.createElement('code')).textContent = part.slice(1, -1);
    } else if (part.startsWith('**') && part.endsWith('**') && part.length > 3) {
      parent.appendChild(document.createElement('strong')).textContent = part.slice(2, -2);
    } else {
      parent.appendChild(document.createTextNode(part));
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
