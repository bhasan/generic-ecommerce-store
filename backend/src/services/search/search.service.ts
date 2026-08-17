export type ProductVisibilityFilter = {
  includeHidden: boolean;
  includeVipOnly: boolean;
};

export type Pagination = {
  limit: number;
  offset: number;
};

// Minimal shape returned by search — matches the full product include shape.
// Using a broad type here keeps the interface decoupled from Prisma internals;
// callers cast to the full product type they already expect.
export type SearchedProduct = Record<string, unknown> & { id: number };

export interface SearchService {
  searchProducts(
    visibility: ProductVisibilityFilter,
    q: string,
    pagination: Pagination,
  ): Promise<SearchedProduct[]>;
}
