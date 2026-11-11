import test from 'node:test';
import assert from 'node:assert/strict';
import { compareOutput, publicSurface } from './gates.mjs';
const svg =
  '<svg id="m1" style="--mermaid-font:Arial"><g id="m1-node-a" class="node userClass" data-ast="a"><rect width="2"/></g></svg>';
test('protected identifiers fail despite unchanged geometry', () => {
  for (const changed of [
    svg.replace('m1-node-a', 'm1-node-b'),
    svg.replace('userClass', 'different'),
    svg.replace('data-ast="a"', 'data-ast="b"'),
    svg.replace('Arial', 'Verdana'),
  ])
    assert.equal(compareOutput(svg, changed, 0).surface.equal, false);
});
test('unprotected nesting/paint edits may enter the output lane', () => {
  const changed = svg.replace('<rect width="2"/>', '<g><rect width="2" fill="red"/></g>');
  const result = compareOutput(svg, changed, 0);
  assert.equal(result.surface.equal, true);
  assert.notEqual(result.bytes.baseSha256, result.bytes.headSha256);
});
test('class ordering and XML attribute encoding are semantic', () => {
  assert.deepEqual(
    publicSurface(svg),
    publicSurface(
      svg.replace('node userClass', 'userClass node').replace('data-ast="a"', 'data-ast="&#97;"')
    )
  );
});
test('custom properties in style sheets and malformed output are checked', () => {
  const styled = '<svg><style>.node { --mermaid-color: red; }</style></svg>';
  assert.equal(compareOutput(styled, styled.replace('red', 'blue'), 0).surface.equal, false);
  assert.throws(() => publicSurface('<svg id=unquoted></svg>'));
});
test('quoted semicolons in protected properties cannot hide changed suffixes', () => {
  const base = '<svg style="--mermaid-font: &quot;a;b&quot;"></svg>';
  assert.equal(compareOutput(base, base.replace('a;b', 'a;c'), 0).surface.equal, false);
});
