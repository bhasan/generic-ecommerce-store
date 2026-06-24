import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import useProductFilters from './useProductFilters';

const products = [
  { id: 1, name: 'Apple Juice', description: 'Fresh' },
  { id: 2, name: 'Orange Soda', description: 'Fizzy' },
];

describe('useProductFilters', () => {
  it('returns null filteredProducts when query is empty', () => {
    const { result } = renderHook(() => useProductFilters(products));
    expect(result.current.filteredProducts).toBeNull();
  });

  it('filters by name (case-insensitive)', () => {
    const { result } = renderHook(() => useProductFilters(products));
    act(() => { result.current.setSearchQuery('apple'); });
    expect(result.current.filteredProducts).toHaveLength(1);
    expect(result.current.filteredProducts[0].id).toBe(1);
  });

  it('filters by description', () => {
    const { result } = renderHook(() => useProductFilters(products));
    act(() => { result.current.setSearchQuery('fizzy'); });
    expect(result.current.filteredProducts[0].id).toBe(2);
  });

  it('returns empty array when no match', () => {
    const { result } = renderHook(() => useProductFilters(products));
    act(() => { result.current.setSearchQuery('zzznomatch'); });
    expect(result.current.filteredProducts).toHaveLength(0);
  });
});
