import { useState, useMemo } from 'react';

export default function useProductFilters(orderedProducts) {
  const [searchQuery, setSearchQuery] = useState('');
  const filteredProducts = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return null;
    return orderedProducts.filter(p =>
      p.name?.toLowerCase().includes(term) ||
      p.description?.toLowerCase().includes(term)
    );
  }, [searchQuery, orderedProducts]);
  return { searchQuery, setSearchQuery, filteredProducts };
}
