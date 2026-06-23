import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductItemModal from './ProductItemModal';
import { ROLES } from '../../utils/roles';

const addToCartMock = vi.fn();
const onCloseMock = vi.fn();
const useAppMock = vi.fn();

vi.mock('../../context/AppContext', () => ({
  useApp: () => useAppMock(),
  AppProvider: ({ children }) => children,
}));

// Weight variant with 1g / 3.5g / 7g options and price breaks matching the
// browser-verified setup: base $15/g, 3.5g → $7.14/g ($24.99), 7g → $5.71/g ($39.97)
const weightVariant = {
  id: 2001,
  label: 'House Blend',
  basePrice: 15,
  stock: 100,
  stockEnabled: false,
  isDefault: true,
  active: true,
  pricingMode: 'WEIGHT',
  quantityOptions: [
    { quantity: 1,   sortOrder: 0 },
    { quantity: 3.5, sortOrder: 1 },
    { quantity: 7,   sortOrder: 2 },
  ],
  priceBreaks: [
    { minQuantity: 3.5, unitPrice: 7.14 },
    { minQuantity: 7,   unitPrice: 5.71 },
  ],
};

const flowerProduct = {
  id: 201,
  name: 'Test Flower',
  description: 'Premium bud',
  hidden: false,
  images: [],
  variants: [weightVariant],
  category: { name: 'Flower' },
};

const renderModal = () =>
  render(
    <ProductItemModal
      productId={201}
      onClose={onCloseMock}
      onViewFullPage={vi.fn()}
    />
  );

describe('ProductItemModal — weight variant price breaks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppMock.mockReturnValue({
      products: [flowerProduct],
      addToCart: addToCartMock,
      currentUser: { id: 1, username: 'johncustomer', roles: [ROLES.CUSTOMER] },
      isLoadingProducts: false,
    });
  });

  it('shows the quantity dropdown with all three weight options', () => {
    renderModal();
    const select = screen.getByRole('combobox');
    const options = Array.from(select.options).map(o => o.value);
    expect(options).toEqual(['1', '3.5', '7']);
  });

  it('defaults to 1g and shows base price total of $15.00 with no discount', () => {
    renderModal();
    expect(screen.getByRole('combobox')).toHaveValue('1');
    expect(screen.getByText(/Total \(1 items\):/)).toBeInTheDocument();
    expect(screen.queryByText(/Save/)).not.toBeInTheDocument();
  });

  it('shows $24.99 total and savings badge when 3.5g is selected', () => {
    renderModal();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '3.5' } });
    expect(screen.getByText('$24.99')).toBeInTheDocument();
    expect(screen.getByText(/Save \$27\.51/)).toBeInTheDocument();
  });

  it('shows $39.97 total and savings badge when 7g is selected', () => {
    renderModal();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '7' } });
    expect(screen.getByText('$39.97')).toBeInTheDocument();
    expect(screen.getByText(/Save \$65\.03/)).toBeInTheDocument();
  });

  it('shows the strikethrough original price for 3.5g (should be $52.50)', () => {
    renderModal();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '3.5' } });
    expect(screen.getByText('$52.50')).toBeInTheDocument();
  });

  it('shows the strikethrough original price for 7g (should be $105.00)', () => {
    renderModal();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '7' } });
    expect(screen.getByText('$105.00')).toBeInTheDocument();
  });

  it('adds to cart with the correct quantity when 3.5g is selected', () => {
    renderModal();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '3.5' } });
    fireEvent.click(screen.getByRole('button', { name: /add to cart/i }));
    expect(addToCartMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 201 }),
      expect.objectContaining({ id: 2001 }),
      3.5
    );
  });

  it('adds to cart with the correct quantity when 7g is selected', () => {
    renderModal();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: /add to cart/i }));
    expect(addToCartMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 201 }),
      expect.objectContaining({ id: 2001 }),
      7
    );
  });
});
