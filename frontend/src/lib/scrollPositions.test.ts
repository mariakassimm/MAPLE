import { beforeEach, describe, expect, it } from 'vitest';
import { readPosition, savePosition } from '@/lib/scrollPositions';

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};

describe('scroll positions', () => {
  let store: ReturnType<typeof memory>;
  beforeEach(() => {
    store = memory();
  });

  it('returns what was saved for the same history entry and page', () => {
    savePosition(store, 'k1', '/shop', 1840.4);
    expect(readPosition(store, 'k1', '/shop')).toBe(1840);
  });

  it('never applies a position saved for a different page or entry', () => {
    savePosition(store, 'default', '/shop', 900);
    expect(readPosition(store, 'default', '/about')).toBeNull();
    expect(readPosition(store, 'other', '/shop')).toBeNull();
  });

  it('keeps only the most recent entries and survives broken storage', () => {
    for (let i = 0; i < 80; i++) savePosition(store, `k${i}`, '/shop', i + 1);
    expect(readPosition(store, 'k0', '/shop')).toBeNull();
    expect(readPosition(store, 'k79', '/shop')).toBe(80);
    expect(readPosition({ getItem: () => '{not json' }, 'k', '/shop')).toBeNull();
    expect(() =>
      savePosition(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error('full');
          },
        },
        'k',
        '/shop',
        5,
      ),
    ).not.toThrow();
  });
});
