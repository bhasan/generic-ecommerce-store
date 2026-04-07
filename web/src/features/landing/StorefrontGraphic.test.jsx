import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import StorefrontGraphic from './StorefrontGraphic';

describe('StorefrontGraphic', () => {
  it('renders an image with the correct alt text', () => {
    render(<StorefrontGraphic />);
    expect(screen.getByAltText('Smoke Station interior')).toBeInTheDocument();
  });

  it('uses the 2x WebP as the fallback img src', () => {
    render(<StorefrontGraphic />);
    expect(screen.getByAltText('Smoke Station interior')).toHaveAttribute(
      'src',
      '/images/storefront-2x.webp'
    );
  });

  it('includes both 1x and 2x sources in the WebP srcSet', () => {
    const { container } = render(<StorefrontGraphic />);
    const source = container.querySelector('source[type="image/webp"]');
    expect(source).toBeInTheDocument();
    expect(source.getAttribute('srcset')).toContain('/images/storefront-1x.webp 1120w');
    expect(source.getAttribute('srcset')).toContain('/images/storefront-2x.webp 2240w');
  });

  it('sets explicit width and height to prevent layout shift', () => {
    render(<StorefrontGraphic />);
    const img = screen.getByAltText('Smoke Station interior');
    expect(img).toHaveAttribute('width', '2240');
    expect(img).toHaveAttribute('height', '1091');
  });

  it('marks the image as high fetch priority', () => {
    render(<StorefrontGraphic />);
    const img = screen.getByAltText('Smoke Station interior');
    expect(img.getAttribute('fetchpriority')).toBe('high');
  });
});
