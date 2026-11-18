import { randomInt } from 'crypto';

// No 0/O/1/I/L so numbers can be read out over the phone without mistakes.
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

// Random rather than sequential: order numbers are quoted to guests, so they should not be guessable or reveal volume.
export const generateOrderNumber = (): string =>
  `MPL-${Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')}`;

export const generateReturnNumber = (): string =>
  `RTN-${Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')}`;
