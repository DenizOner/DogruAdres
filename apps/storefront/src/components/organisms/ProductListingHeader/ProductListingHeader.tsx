'use client';

export const ProductListingHeader = ({ total }: { total: number }) => {
  return (
    <div
      className="flex w-full items-center justify-between"
      data-testid="product-listing-header"
    >
      <div data-testid="product-listing-total">{total} listings</div>
    </div>
  );
};
