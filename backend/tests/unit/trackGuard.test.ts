import { beforeEach, describe, expect, it } from 'vitest';
import { assertTrackingAllowed, clearTrackingFailures, MAX_FAILURES, recordTrackingFailure } from '../../src/modules/orders/trackGuard';

describe('tracking attempt guard', () => {
  beforeEach(() => clearTrackingFailures());

  it('allows a few mistakes, then blocks that order number', () => {
    for (let i = 0; i < MAX_FAILURES - 1; i++) recordTrackingFailure('MPL-AAAAAAAA');
    expect(() => assertTrackingAllowed('MPL-AAAAAAAA')).not.toThrow();
    recordTrackingFailure('MPL-AAAAAAAA');
    expect(() => assertTrackingAllowed('MPL-AAAAAAAA')).toThrow(/Too many/);
  });

  it('does not affect other order numbers', () => {
    for (let i = 0; i < MAX_FAILURES; i++) recordTrackingFailure('MPL-AAAAAAAA');
    expect(() => assertTrackingAllowed('MPL-BBBBBBBB')).not.toThrow();
  });

  it('forgets failures after the window and after a success', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < MAX_FAILURES; i++) recordTrackingFailure('MPL-AAAAAAAA', t0);
    expect(() => assertTrackingAllowed('MPL-AAAAAAAA', t0 + 16 * 60 * 1000)).not.toThrow();
    for (let i = 0; i < MAX_FAILURES; i++) recordTrackingFailure('MPL-CCCCCCCC', t0);
    clearTrackingFailures('MPL-CCCCCCCC');
    expect(() => assertTrackingAllowed('MPL-CCCCCCCC', t0)).not.toThrow();
  });
});
