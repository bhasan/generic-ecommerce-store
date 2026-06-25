import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ProductsToolbar from './ProductsToolbar';

describe('ProductsToolbar', () => {
  it('renders search input', () => {
    render(<ProductsToolbar searchQuery="" viewMode="grid" onSearch={vi.fn()}
      onViewModeChange={vi.fn()} onAddProduct={vi.fn()} canManage={true} />);
    expect(screen.getByPlaceholderText('Filter products…')).toBeTruthy();
  });

  it('calls onSearch when typing', () => {
    const onSearch = vi.fn();
    render(<ProductsToolbar searchQuery="" viewMode="grid" onSearch={onSearch}
      onViewModeChange={vi.fn()} onAddProduct={vi.fn()} canManage={true} />);
    fireEvent.change(screen.getByPlaceholderText('Filter products…'), { target: { value: 'apple' } });
    expect(onSearch).toHaveBeenCalledWith('apple');
  });

  it('shows Add Product button when canManage', () => {
    render(<ProductsToolbar searchQuery="" viewMode="grid" onSearch={vi.fn()}
      onViewModeChange={vi.fn()} onAddProduct={vi.fn()} canManage={true} />);
    expect(screen.getByText('Add Product')).toBeTruthy();
  });

  it('hides Add Product button when not canManage', () => {
    render(<ProductsToolbar searchQuery="" viewMode="grid" onSearch={vi.fn()}
      onViewModeChange={vi.fn()} onAddProduct={vi.fn()} canManage={false} />);
    expect(screen.queryByText('Add Product')).toBeNull();
  });
});
