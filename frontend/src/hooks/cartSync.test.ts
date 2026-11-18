import { describe, expect, it } from 'vitest';
import { mergeCarts } from '@/hooks/cartSync';

describe('mergeCarts', () => {
  it('keeps the larger quantity so the same bag is not doubled', () => {
    expect(mergeCarts([{ variantId: 'a', quantity: 2 }], [{ variantId: 'a', quantity: 2 }])).toEqual([
      { variantId: 'a', quantity: 2 },
    ]);
    expect(mergeCarts([{ variantId: 'a', quantity: 1 }], [{ variantId: 'a', quantity: 3 }])).toEqual([
      { variantId: 'a', quantity: 3 },
    ]);
  });
  it('combines items that appear on only one side', () => {
    const out = mergeCarts([{ variantId: 'a', quantity: 1 }], [{ variantId: 'b', quantity: 2 }]);
    expect(out).toHaveLength(2);
  });
  it('never exceeds 99 per line', () =>
    expect(mergeCarts([{ variantId: 'a', quantity: 500 }], [])[0]!.quantity).toBe(99));
});
