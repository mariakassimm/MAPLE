import { describe, expect, it } from 'vitest';
import { rupeesToPaisa } from '@/lib/format';

describe('rupeesToPaisa', () => {
  it('converts whole and decimal rupees exactly', () => {
    expect(rupeesToPaisa('20300')).toBe(2_030_000);
    expect(rupeesToPaisa('1,250.50')).toBe(125_050);
    expect(rupeesToPaisa('0.1')).toBe(10);
  });
  it('rejects junk, negatives and extra decimals', () => {
    for (const bad of ['', 'abc', '-5', '1.234', '1e5', '12 000']) expect(rupeesToPaisa(bad)).toBeNull();
  });
});
