import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CartPage from './CartPage';
import { DeliveryMethod } from '../../constants/orderMethods';

const useAppMock = vi.fn();

vi.mock('../../context/AppContext', () => ({
  useApp: () => useAppMock(),
}));

// Suppress lucide-react SVG rendering issues in jsdom
vi.mock('../products/ProductImage', () => ({
  default: ({ alt }) => <img alt={alt} />,
}));

vi.mock('../products/productsHelpers', () => ({
  getDiscountedUnitPrice: (item) => item.price,
  getProductCategoryLabel: (item) => item.category?.name ?? '',
  getProductImageSrc: () => '/placeholder.png',
}));

vi.mock('../../components/common/HeaderDivider', () => ({
  default: () => <hr />,
}));

const baseItem = {
  id: 1,
  name: 'Blue Dream',
  price: 20,
  quantity: 1,
  category: { name: 'Flower', allowedQuantities: [] },
  allowedQuantitiesOverride: [],
};

const baseAppState = {
  cart: [baseItem],
  removeFromCart: vi.fn(),
  updateCartQuantity: vi.fn(),
  taxRate: 0.1,
  minimumDeliveryOrder: 35,
  minimumDeliveryOrderEnabled: true,
  deliveryDisabled: false,
  deliveryDisabledMessage: '',
};

const renderCart = (appState = {}) =>
  render(
    <MemoryRouter initialEntries={['/cart']}>
      <Routes>
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<div data-testid="checkout-page">Checkout</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('CartPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppMock.mockReturnValue(baseAppState);
  });

  it('shows empty cart state when cart is empty', () => {
    useAppMock.mockReturnValue({ ...baseAppState, cart: [] });
    renderCart();
    expect(screen.getByText(/your cart is empty/i)).toBeInTheDocument();
  });

  it('renders cart items when cart has products', () => {
    renderCart();
    expect(screen.getByText('Blue Dream')).toBeInTheDocument();
  });

  it('defaults to PICKUP delivery method', () => {
    renderCart();
    const pickupBtn = screen.getByRole('button', { name: /pick up/i });
    expect(pickupBtn).toHaveClass('active');
  });

  it('disables the Delivery button when minimum order is not met', () => {
    renderCart(); // cart total = $20, minimum = $35
    const deliveryBtn = screen.getByRole('button', { name: /^delivery$/i });
    expect(deliveryBtn).toBeDisabled();
  });

  it('shows minimum order notice when delivery is blocked by minimum', () => {
    renderCart();
    expect(screen.getByText(/delivery requires/i)).toBeInTheDocument();
  });

  it('shows custom disabled message when deliveryDisabled is set', () => {
    useAppMock.mockReturnValue({
      ...baseAppState,
      deliveryDisabled: true,
      deliveryDisabledMessage: 'We do not deliver today.',
    });
    renderCart();
    expect(screen.getAllByText('We do not deliver today.').length).toBeGreaterThan(0);
  });

  it('enables delivery button when cart meets minimum', () => {
    useAppMock.mockReturnValue({
      ...baseAppState,
      cart: [{ ...baseItem, price: 40 }],
    });
    renderCart();
    const deliveryBtn = screen.getByRole('button', { name: /^delivery$/i });
    expect(deliveryBtn).not.toBeDisabled();
  });

  it('switches to DELIVERY when button is clicked and minimum is met', () => {
    useAppMock.mockReturnValue({
      ...baseAppState,
      minimumDeliveryOrderEnabled: false,
    });
    renderCart();
    fireEvent.click(screen.getByRole('button', { name: /^delivery$/i }));
    expect(screen.getByRole('button', { name: /^delivery$/i })).toHaveClass('active');
  });

  it('navigates to /checkout with PICKUP state when proceeding', () => {
    renderCart();
    fireEvent.click(screen.getByRole('button', { name: /proceed to checkout/i }));
    expect(screen.getByTestId('checkout-page')).toBeInTheDocument();
  });

  it('calls removeFromCart when remove button is clicked', () => {
    const removeFromCart = vi.fn();
    useAppMock.mockReturnValue({ ...baseAppState, removeFromCart });
    renderCart();
    fireEvent.click(screen.getByRole('button', { name: /remove item/i }));
    expect(removeFromCart).toHaveBeenCalledWith(baseItem.id);
  });

  it('calls updateCartQuantity when + button is clicked', () => {
    const updateCartQuantity = vi.fn();
    useAppMock.mockReturnValue({ ...baseAppState, updateCartQuantity });
    renderCart();
    fireEvent.click(screen.getByRole('button', { name: /increase quantity/i }));
    expect(updateCartQuantity).toHaveBeenCalledWith(baseItem.id, 2);
  });

  it('calls updateCartQuantity when - button is clicked', () => {
    const updateCartQuantity = vi.fn();
    useAppMock.mockReturnValue({ ...baseAppState, updateCartQuantity });
    renderCart();
    fireEvent.click(screen.getByRole('button', { name: /decrease quantity/i }));
    expect(updateCartQuantity).toHaveBeenCalledWith(baseItem.id, 0);
  });

  it('renders a select dropdown for items with allowedQuantitiesOverride', () => {
    useAppMock.mockReturnValue({
      ...baseAppState,
      cart: [{ ...baseItem, allowedQuantitiesOverride: [1, 2, 3] }],
    });
    renderCart();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});
