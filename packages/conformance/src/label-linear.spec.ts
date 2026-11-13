/**
 * D566: label layout reads `<script>` and `<style>` in time linear in the label's length. A
 * ratio test on CPU time, not an absolute time: 8 times the text should cost about 8 times as
 * much; the pass that scanned to the end of the label from every start tag cost about 64 times.
 */
import { layoutLabel, tableMeasurer, type FontKey } from '@mermaid-js/core/text';
import { describe, expect, it } from 'vitest';
import { linearRatio } from './linear-time.ts';

const FONT: FontKey = { family: 'Arial', size: 10, weight: 400 };
const layout = (text: string) => layoutLabel(text, FONT, 200, tableMeasurer);

describe('label layout: linear in the number of <script> and <style> starts', () => {
  it.each([
    ['start tags cut short', '<script'],
    ['start tags with no end tag', '<script> '],
    ['start tags that never close their bracket', '<style x '],
    ['closed elements', '<script>a</script> '],
    ['end tags that never close their bracket', '<script> </script x '],
  ])(
    '%s',
    (_name, part) => {
      const small = part.repeat(2_000);
      const large = part.repeat(16_000);
      expect(
        linearRatio(
          () => layout(small),
          () => layout(large)
        )
      ).toBeLessThan(24);
    },
    30_000
  );
});
