import { describe, expect, it } from 'vitest';
import { kindFor } from './Placeholder';

describe('kindFor', () => {
  it('maps category names to drawings', () => {
    expect(kindFor('handbags Sample Tote')).toBe('bag');
    expect(kindFor('wallets')).toBe('wallet');
    expect(kindFor('Jewellery')).toBe('jewellery');
    expect(kindFor('watches')).toBe('watch');
    expect(kindFor('Eyewear')).toBe('eyewear');
    expect(kindFor('Gifts')).toBe('gift');
  });
  it('falls back to a neutral frame', () => {
    expect(kindFor('Something else')).toBe('editorial');
    expect(kindFor(undefined)).toBe('editorial');
  });
});
