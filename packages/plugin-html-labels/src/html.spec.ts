import { describe, expect, it } from 'vitest';
import { ALLOWED_TAGS, labelHtml } from './html.ts';

describe('labelHtml: plain labels', () => {
  it('keeps the tags the plugin allows, as written', () => {
    expect(labelHtml('A <b>bold</b> <span style="color:red">word</span>', 'plain')).toBe(
      'A <b>bold</b> <span style="color:red">word</span>'
    );
  });

  it('escapes text shaped like a tag that is not HTML, so it is shown', () => {
    expect(labelHtml('List<T> and a < b > c', 'plain')).toBe('List&lt;T&gt; and a &lt; b &gt; c');
  });

  it('escapes an HTML tag the plugin does not allow', () => {
    expect(labelHtml('<iframe src="x"></iframe>', 'plain')).toBe(
      '&lt;iframe src="x"&gt;&lt;/iframe&gt;'
    );
  });

  it('leaves script and style to the sanitizer, which drops them with what they hold', () => {
    expect(labelHtml('a<script>x()</script>b', 'plain')).toBe('a<script>x()</script>b');
    expect(labelHtml('<STYLE>p{}</STYLE>', 'plain')).toBe('<STYLE>p{}</STYLE>');
  });

  it('breaks at a line end, a <br> and a written backslash-n', () => {
    expect(labelHtml('one\ntwo<br/>three\\nfour\r\nfive', 'plain')).toBe(
      'one<br>two<br>three<br>four<br>five'
    );
  });

  it('keeps character references and does not read emphasis', () => {
    expect(labelHtml('Tom &amp; **Jerry** &#35;1', 'plain')).toBe('Tom &amp; **Jerry** &#35;1');
  });

  it('trims the label', () => {
    expect(labelHtml('  text  ', 'plain')).toBe('text');
  });
});

describe('labelHtml: emphasis', () => {
  it('reads **bold**, *italic*, __bold__ and _italic_', () => {
    expect(labelHtml('**a** *b* __c__ _d_', 'emphasis')).toBe(
      '<strong>a</strong> <em>b</em> <strong>c</strong> <em>d</em>'
    );
  });

  it('leaves an underscore inside a word and an unmatched mark as text', () => {
    expect(labelHtml('snake_case_name and 2 * 3', 'emphasis')).toBe('snake_case_name and 2 * 3');
  });

  it('does not read marks inside a tag', () => {
    expect(labelHtml('<a href="a_b_c" title="*x*">t</a>', 'emphasis')).toBe(
      '<a href="a_b_c" title="*x*">t</a>'
    );
  });

  it('closes a mark its line leaves open', () => {
    expect(labelHtml('**a\nb**', 'emphasis')).toBe('**a<br>b**');
    expect(labelHtml('**a *b**', 'emphasis')).toBe('<strong>a <em>b</em></strong>');
    expect(labelHtml('**a', 'emphasis')).toBe('**a');
  });

  it('still breaks at a written backslash-n, and has no inline code', () => {
    expect(labelHtml('a\\n`b`', 'emphasis')).toBe('a<br>`b`');
  });
});

describe('labelHtml: markdown', () => {
  it('reads emphasis, inline code and backslash escapes', () => {
    expect(labelHtml('**a** `x < y` \\*not\\*', 'markdown')).toBe(
      '<strong>a</strong> <code>x &lt; y</code> *not*'
    );
  });

  it('breaks at line ends, drops blank lines, and keeps a written backslash-n', () => {
    expect(labelHtml('one\n\n  two<br>three\\n', 'markdown')).toBe('one<br>two<br>three\\n');
  });

  it('makes bullet items a list, nested one level', () => {
    expect(labelHtml('Intro\n- a\n  - b\n- c\nOutro', 'markdown')).toBe(
      'Intro<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>Outro'
    );
  });

  it('keeps raw HTML, as v12 did in a markdown string', () => {
    expect(labelHtml('**a** <u>b</u>', 'markdown')).toBe('<strong>a</strong> <u>b</u>');
  });
});

describe('the allowed tags', () => {
  it('hold nothing that runs or embeds', () => {
    for (const tag of ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'svg'])
      expect(ALLOWED_TAGS).not.toContain(tag);
  });
});
