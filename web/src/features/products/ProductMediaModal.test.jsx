import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProductMediaModal from './ProductMediaModal';
import { PRODUCT_FALLBACK_IMAGE } from './productsHelpers';

describe('ProductMediaModal', () => {
  it('falls back to the shared placeholder image when a product has no media', () => {
    render(
      <ProductMediaModal
        product={{ id: 1, name: 'Fallback Product' }}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByAltText('Fallback Product 1')).toHaveAttribute('src', PRODUCT_FALLBACK_IMAGE);
  });

  it('cycles through image thumbnails and closes on escape', () => {
    const onClose = vi.fn();

    render(
      <ProductMediaModal
        product={{ id: 1, name: 'Media Product', images: ['/one.png', '/two.png'] }}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByLabelText(/next/i));
    expect(screen.getAllByAltText('Media Product 2')[0]).toHaveAttribute('src', '/two.png');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
