import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {}, listeners: {}, setNodeRef: () => {},
    transform: null, transition: null, isDragging: false,
  }),
}));
vi.mock('@dnd-kit/utilities', () => ({ CSS: { Transform: { toString: () => '' } } }));

import ManageProductCard from './ManageProductCard';

const product = {
  id: 1, name: 'Test Product', description: 'Desc', hidden: false,
  images: [{ url: '/img.jpg', role: 'GALLERY' }],
  variants: [{ id: 1, basePrice: '9.99', stock: '5', stockEnabled: true, isDefault: true }],
};

describe('ManageProductCard', () => {
  it('renders product name', () => {
    render(<ManageProductCard product={product} canManage={false} dragEnabled={false}
      onEdit={vi.fn()} onDeleteClick={vi.fn()} onToggleHidden={vi.fn()}
      canDelete={false} editingDisabled={false} getProductLabel={() => 'Cat'} />);
    expect(screen.getByText('Test Product')).toBeTruthy();
  });

  it('calls onEdit when Edit button clicked', () => {
    const onEdit = vi.fn();
    render(<ManageProductCard product={product} canManage={true} dragEnabled={false}
      onEdit={onEdit} onDeleteClick={vi.fn()} onToggleHidden={vi.fn()}
      canDelete={false} editingDisabled={false} getProductLabel={() => 'Cat'} />);
    fireEvent.click(screen.getByText('Edit'));
    expect(onEdit).toHaveBeenCalledWith(product);
  });

  it('shows Hidden badge when product.hidden is true', () => {
    render(<ManageProductCard product={{ ...product, hidden: true }} canManage={false}
      dragEnabled={false} onEdit={vi.fn()} onDeleteClick={vi.fn()} onToggleHidden={vi.fn()}
      canDelete={false} editingDisabled={false} getProductLabel={() => 'Cat'} />);
    expect(screen.getByText('Hidden')).toBeTruthy();
  });
});
