import { describe, expect, it } from 'vitest';
import { formatPKR, optionLabel } from '@/lib/format';

describe('formatPKR', () => {
  it('formats whole rupees without decimals', () => expect(formatPKR(2030000)).toBe('Rs 20,300'));
  it('keeps paisa when present', () => expect(formatPKR(1250)).toBe('Rs 12.50'));
  it('formats zero', () => expect(formatPKR(0)).toBe('Rs 0'));
  it('joins option values', () =>
    expect(
      optionLabel([
        { name: 'color', value: 'Ivory' },
        { name: 'size', value: 'M' },
      ]),
    ).toBe('Ivory / M'));
});

import { normalizePhone, PK_MOBILE } from '@/lib/format';

const PK_MOBILE_CASES: Array<[string, boolean]> = [
  ['03001234567', true],
  ['3001234567', true],
  ['923001234567', true],
  ['+923001234567', true],
  ['0300 123 4567', true],
  ['0345-1234567', true],
  ['03501234567', false],
  ['02001234567', false],
  ['0300123456', false],
  ['030012345678', false],
  ['+93001234567', false],
  ['', false],
  ['abc', false],
];
describe('PK_MOBILE contract (keep identical to the backend list)', () => {
  it.each(PK_MOBILE_CASES)('%s -> %s', (input, ok) => expect(PK_MOBILE.test(normalizePhone(input))).toBe(ok));
});
