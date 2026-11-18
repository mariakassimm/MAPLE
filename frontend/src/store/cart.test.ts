import { beforeEach, describe, expect, it } from 'vitest';
import { useCart } from '@/store/cart';

beforeEach(() => useCart.getState().clear());

describe('cart store', () => {
  it('merges repeated adds into one line', () => {
    useCart.getState().addLine('v1', 1);
    useCart.getState().addLine('v1', 2);
    expect(useCart.getState().lines).toEqual([{ variantId: 'v1', quantity: 3 }]);
  });
  it('caps quantity at 99', () => {
    useCart.getState().addLine('v1', 120);
    expect(useCart.getState().lines[0]!.quantity).toBe(99);
  });
  it('removes a line when quantity reaches zero', () => {
    useCart.getState().addLine('v1');
    useCart.getState().setLineQuantity('v1', 0);
    expect(useCart.getState().lines).toHaveLength(0);
  });
  it('stores only ids and quantities, never prices', () => {
    useCart.getState().addLine('v1');
    expect(Object.keys(useCart.getState().lines[0]!).sort()).toEqual(['quantity', 'variantId']);
  });
  it('counts total units', () => {
    useCart.getState().addLine('a', 2);
    useCart.getState().addLine('b', 3);
    expect(useCart.getState().totalUnits()).toBe(5);
  });
  it('refuses every change while locked for a staff account', () => {
    useCart.setState({ blocked: true });
    useCart.getState().addLine('v1', 2);
    expect(useCart.getState().lines).toHaveLength(0);
    useCart.setState({ blocked: false });
    useCart.getState().addLine('v1');
    useCart.setState({ blocked: true });
    useCart.getState().setLineQuantity('v1', 5);
    expect(useCart.getState().lines).toEqual([{ variantId: 'v1', quantity: 1 }]);
    useCart.setState({ blocked: false });
  });
});
