import { useState } from 'react';

export default function useProductFilters(orderedProducts) {
  const [searchQuery, setSearchQuery] = useState('');
  const term = searchQuery.trim().toLowerCase();
  const filteredProducts = term
    ? orderedProducts.filter(p =>
        p.name?.toLowerCase().includes(term) ||
        p.description?.toLowerCase().includes(term)
      )
    : null;
  return { searchQuery, setSearchQuery, filteredProducts };
}
