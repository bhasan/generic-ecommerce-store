import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProductsHeader from './ProductsHeader';

const renderHeader = (viewMode, onViewModeChange = vi.fn()) =>
  render(
    <ProductsHeader
      title="Products"
      subtitle="Browse our products"
      viewMode={viewMode}
      onViewModeChange={onViewModeChange}
    />
  );

describe('ProductsHeader view toggle', () => {
  it('renders Grid and List buttons (not Compact)', () => {
    renderHeader('grid');

    expect(screen.getByRole('button', { name: /grid/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /list/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /compact/i })).not.toBeInTheDocument();
  });

  it('marks Grid button as active when viewMode is grid', () => {
    renderHeader('grid');

    expect(screen.getByRole('button', { name: /grid/i })).toHaveClass('active');
    expect(screen.getByRole('button', { name: /list/i })).not.toHaveClass('active');
  });

  it('marks List button as active when viewMode is list', () => {
    renderHeader('list');

    expect(screen.getByRole('button', { name: /list/i })).toHaveClass('active');
    expect(screen.getByRole('button', { name: /grid/i })).not.toHaveClass('active');
  });

  it('calls onViewModeChange with "grid" when Grid is clicked', () => {
    const onViewModeChange = vi.fn();
    renderHeader('list', onViewModeChange);

    fireEvent.click(screen.getByRole('button', { name: /grid/i }));

    expect(onViewModeChange).toHaveBeenCalledWith('grid');
  });

  it('calls onViewModeChange with "list" when List is clicked', () => {
    const onViewModeChange = vi.fn();
    renderHeader('grid', onViewModeChange);

    fireEvent.click(screen.getByRole('button', { name: /list/i }));

    expect(onViewModeChange).toHaveBeenCalledWith('list');
  });
});
