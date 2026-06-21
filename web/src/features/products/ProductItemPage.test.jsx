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

  it('opens the media modal from the main image and supports gallery navigation', () => {
    renderProductPage();

    fireEvent.click(screen.getByAltText('Blue Dream'));
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/next image/i));
    expect(screen.getAllByAltText('Blue Dream 2')[0]).toHaveAttribute('src', '/secondary.png');
  });
});
