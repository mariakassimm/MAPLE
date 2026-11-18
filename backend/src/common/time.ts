import { randomInt } from 'crypto';

// Pakistan has no daylight saving, so a fixed +5h offset is exact. Payment providers expect local time.
export function pktStamp(date: Date, withSpace = false): string {
  const t = new Date(date.getTime() + 5 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  const day = `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}`;
  const time = `${p(t.getUTCHours())}${p(t.getUTCMinutes())}${p(t.getUTCSeconds())}`;
  return withSpace ? `${day} ${time}` : `${day}${time}`;
}

const REF_CHARS = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

// Exactly 20 alphanumeric characters: the limit shared by JazzCash (pp_TxnRefNo) and Easypay (orderRefNum).
export const newPaymentRef = (now: Date): string =>
  `T${pktStamp(now)}${Array.from({ length: 5 }, () => REF_CHARS[randomInt(REF_CHARS.length)]).join('')}`;
