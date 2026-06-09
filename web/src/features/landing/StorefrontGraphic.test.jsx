import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import StorefrontGraphic from './StorefrontGraphic';

vi.mock('../../context/AppContext', () => ({
  useApp: vi.fn(() => ({ branding: null })),
}));

import { useApp } from '../../context/AppContext';

describe('StorefrontGraphic', () => {
  describe('fallback (no heroImageUrl)', () => {
    it('renders an image with the correct alt text', () => {
      render(<StorefrontGraphic />);
      expect(screen.getByAltText('Store interior')).toBeInTheDocument();
    });

    it('uses the 2x WebP as the fallback img src', () => {
      render(<StorefrontGraphic />);
      expect(screen.getByAltText('Store interior')).toHaveAttribute(
        'src',
        '/images/storefront-2x.webp'
      );
    });

    it('includes both 1x and 2x sources in the WebP srcSet', () => {
      const { container } = render(<StorefrontGraphic />);
      const source = container.querySelector('source');
      expect(source).toBeInTheDocument();
      expect(source.getAttribute('srcset')).toContain('/images/storefront-1x.webp 1120w');
      expect(source.getAttribute('srcset')).toContain('/images/storefront-2x.webp 2240w');
    });

    it('sets explicit width and height to prevent layout shift', () => {
      render(<StorefrontGraphic />);
      const img = screen.getByAltText('Store interior');
      expect(img).toHaveAttribute('width', '2240');
      expect(img).toHaveAttribute('height', '1091');
    });
  });

  describe('hero image (heroImageUrl provided)', () => {
    it('renders the hero image instead of the default picture', () => {
      useApp.mockReturnValueOnce({ branding: { heroImageUrl: '/uploads/hero.jpg', storeName: 'My Store' } });
      render(<StorefrontGraphic />);
      expect(screen.getByAltText('My Store')).toHaveAttribute('src', '/uploads/hero.jpg');
    });
  });
});
