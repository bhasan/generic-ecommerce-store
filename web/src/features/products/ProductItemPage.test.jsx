import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductItemPage from './ProductItemPage';
import { GUEST_USER, ROLES } from '../../utils/roles';

// Mock window.scrollTo since it's not implemented in JSDOM
window.scrollTo = vi.fn();

const addToCartMock = vi.fn();
const useAppMock = vi.fn();

vi.mock('../../context/AppContext', () => ({
  useApp: () => useAppMock(),
  AppProvider: ({ children }) => children,
}));

vi.mock('../../components/product/ProductReviews', () => ({
  default: () => <div>Product Reviews</div>,
}));

const unitProduct = {
  id: 102,
  name: 'House Special',
  description: 'A unit-priced product with no quantity options',
  hidden: false,
  images: [],
  variants: [
    {
      id: 1002,
      label: 'Default',
      basePrice: 20,
      stock: 50,
      stockEnabled: true,
      isDefault: true,
      active: true,
      pricingMode: 'UNIT',
      quantityOptions: [],
      priceBreaks: [],
    },
  ],
  category: { name: 'Accessories' },
};

const renderUnitProductPage = () =>
  render(
    <MemoryRouter initialEntries={['/products/102']}>
      <Routes>
        <Route path="/products/:id" element={<ProductItemPage />} />
        <Route path="/products" element={<div>Products Page</div>} />
      </Routes>
    </MemoryRouter>
  );

const baseProduct = {
  id: 101,
  name: 'Blue Dream',
  description: 'A featured flower product',
  hidden: false,
  images: [
    { url: '/primary.png', role: 'THUMBNAIL', sortOrder: 0 },
    { url: '/secondary.png', role: 'GALLERY', sortOrder: 1 },
  ],
  variants: [
    {
      id: 1001,
      label: 'Default',
      basePrice: 15,
      stock: 10,
      stockEnabled: true,
      isDefault: true,
      active: true,
      pricingMode: 'UNIT',
      quantityOptions: [{ quantity: 1, sortOrder: 0 }, { quantity: 2, sortOrder: 1 }],
      priceBreaks: [{ minQuantity: 2, unitPrice: 13.5 }],
    },
  ],
  category: { name: 'Flower' },
};

const renderProductPage = () =>
  render(
    <MemoryRouter initialEntries={['/products/101']}>
      <Routes>
        <Route path="/products/:id" element={<ProductItemPage />} />
        <Route path="/products" element={<div>Products Page</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('ProductItemPage behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    useAppMock.mockReturnValue({
      products: [baseProduct],
      addToCart: addToCartMock,
      currentUser: { id: 1, username: 'customer-one', roles: [ROLES.CUSTOMER] },
      isLoadingProducts: false,
    });
  });

  it('blocks hidden products for customers and guests', () => {
    useAppMock.mockReturnValue({
      products: [{ ...baseProduct, hidden: true }],
      addToCart: addToCartMock,
      currentUser: GUEST_USER,
      isLoadingProducts: false,
    });

    renderProductPage();

    expect(screen.getByText('Product Unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add to cart/i })).not.toBeInTheDocument();
  });

  it('lets management users view hidden products and add the selected quantity to cart', () => {
    useAppMock.mockReturnValue({
      products: [{ ...baseProduct, hidden: true }],
      addToCart: addToCartMock,
      currentUser: { id: 3, username: 'manager-one', roles: [ROLES.MANAGEMENT] },
      isLoadingProducts: false,
    });

    renderProductPage();

    expect(screen.getByText('This product is currently hidden from customers')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /add to cart/i }));

    expect(addToCartMock).toHaveBeenCalledWith(expect.objectContaining({ id: 101, hidden: true }), expect.any(Object), 2);
    expect(screen.getByText('Save $3.00')).toBeInTheDocument();
  });

  it('scrolls to top and stores the product id in sessionStorage on mount', () => {
    // Already mocked globally at top
    renderProductPage();

    expect(window.scrollTo).toHaveBeenCalled();
    expect(sessionStorage.getItem('productsScrollProductId')).toBe('101');

    expect(sessionStorage.getItem('productsScrollProductId')).toBe('101');
  });

  it('navigates back to /products when the back button is clicked', () => {
    renderProductPage();

    fireEvent.click(screen.getByRole('button', { name: /back to products/i }));

    expect(screen.getByText('Products Page')).toBeInTheDocument();
  });

  it('shows a number input with whole-number step when variant has no quantityOptions', () => {
    useAppMock.mockReturnValue({
      products: [unitProduct],
      addToCart: addToCartMock,
      currentUser: { id: 1, username: 'customer-one', roles: [ROLES.CUSTOMER] },
      isLoadingProducts: false,
    });

    renderUnitProductPage();

    const input = screen.getByRole('spinbutton');
    expect(input).toBeInTheDocument();
    expect(input.getAttribute('step')).toBe('1');
    expect(input.getAttribute('min')).toBe('1');
  });

  it('defaults initial quantity to 1 for UNIT variants with no quantityOptions', () => {
    useAppMock.mockReturnValue({
      products: [unitProduct],
      addToCart: addToCartMock,
      currentUser: { id: 1, username: 'customer-one', roles: [ROLES.CUSTOMER] },
      isLoadingProducts: false,
    });

    renderUnitProductPage();

    expect(screen.getByRole('spinbutton')).toHaveValue(1);
  });

  it('adds a whole-number quantity to cart for UNIT variants', () => {
    useAppMock.mockReturnValue({
      products: [unitProduct],
      addToCart: addToCartMock,
      currentUser: { id: 1, username: 'customer-one', roles: [ROLES.CUSTOMER] },
      isLoadingProducts: false,
    });

    renderUnitProductPage();

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /add to cart/i }));

    expect(addToCartMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 102 }),
      expect.any(Object),
      3
    );
  });

  it('opens the media modal from the main image and supports gallery navigation', () => {
    renderProductPage();

    fireEvent.click(screen.getByAltText('Blue Dream'));
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/next image/i));
    expect(screen.getAllByAltText('Blue Dream 2')[0]).toHaveAttribute('src', '/secondary.png');
  });
});
