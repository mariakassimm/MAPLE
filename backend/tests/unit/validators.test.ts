import { describe, expect, it } from 'vitest';
import { normalizePkMobile, passwordSchema, pkMobileSchema } from '../../src/common/validators';

describe('Pakistani mobile numbers', () => {
  it.each(['03001234567', '0300-1234567', '+92 300 1234567', '923451234567', '3001234567'])('accepts %s', (n) => {
    expect(normalizePkMobile(n)).toMatch(/^\+923[0-4]\d{8}$/);
  });

  it.each(['0300123456', '02001234567', '03512345678', '+9230012345678', 'abc', ''])('rejects %s', (n) => {
    expect(normalizePkMobile(n)).toBeNull();
  });

  it('normalizes to +92 format through the schema', () => {
    expect(pkMobileSchema.parse('0321 7654321')).toBe('+923217654321');
  });
});

describe('password policy', () => {
  it('accepts a long password with letters and digits', () => {
    expect(passwordSchema.safeParse('Valid-pass-123').success).toBe(true);
  });

  it.each(['short1', 'longpasswordwithoutdigits', '1234567890123', 'a1'.repeat(37)])('rejects %s', (p) => {
    expect(passwordSchema.safeParse(p).success).toBe(false);
  });
});

import { normalizePkMobile as normalizeForContract } from '../../src/common/validators';

const PK_MOBILE_CASES: Array<[string, boolean]> = [
  ['03001234567', true], ['3001234567', true], ['923001234567', true], ['+923001234567', true], ['0300 123 4567', true], ['0345-1234567', true],
  ['03501234567', false], ['02001234567', false], ['0300123456', false], ['030012345678', false], ['+93001234567', false], ['', false], ['abc', false],
];
describe('PK mobile contract (keep identical to the frontend list)', () => {
  it.each(PK_MOBILE_CASES)('%s -> %s', (input, ok) => expect(normalizeForContract(input) !== null).toBe(ok));
});
