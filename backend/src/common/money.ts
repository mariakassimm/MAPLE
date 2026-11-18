// All amounts are integers in paisa (1 PKR = 100 paisa); floats are never used for money.
export const effectivePrice = (price: number, salePrice?: number | null): number =>
  salePrice != null && salePrice < price ? salePrice : price;

export const isOnSale = (price: number, salePrice?: number | null): boolean => salePrice != null && salePrice < price;
