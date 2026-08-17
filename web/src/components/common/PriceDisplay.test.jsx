import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PriceDisplay from './PriceDisplay';

describe('PriceDisplay', () => {
  it('renders a single span with className when hasDiscount is false', () => {
    render(<PriceDisplay price={10} originalPrice={10} hasDiscount={false} className="price" />);
    const span = screen.getByText('$10.00');
    expect(span.className).toBe('price');
  });

  it('renders two spans when hasDiscount is true', () => {
    render(
      <PriceDisplay
        price={8}
        originalPrice={10}
        hasDiscount={true}
        originalClassName="price-original"
        discountedClassName="price-discounted"
      />
    );
    expect(screen.getByText('$10.00').className).toBe('price-original');
    expect(screen.getByText('$8.00').className).toBe('price-discounted');
  });

  it('renders $0.00 without crashing when price is null', () => {
    render(<PriceDisplay price={null} hasDiscount={false} className="price" />);
    expect(screen.getByText('$0.00')).toBeTruthy();
  });
});
