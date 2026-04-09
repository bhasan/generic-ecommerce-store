import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductItemPage from './ProductItemPage';
import { GUEST_USER, ROLES } from '../../utils/roles';

const addToCartMock = vi.fn();
const useAppMock = vi.fn();

vi.mock('../../context/AppContext', () => ({
  useApp: () => useAppMock(),
}));

vi.mock('../../components/product/ProductReviews', () => ({
  default: () => <div>Product Reviews</div>,
}));

const baseProduct = {
  id: 101,
  name: 'Blue Dream',
  description: 'A featured flower product',
  price: 15,
  hidden: false,
  stock: 10,
  stockEnabled: true,
  image: '/primary.png',
  images: ['/primary.png', '/secondary.png'],
  category: {
    name: 'Flower',
    allowedQuantities: [1, 2],
    quantityDiscounts: [{ quantity: 2, type: 'percent', value: 10 }],
  },
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

    expect(addToCartMock).toHaveBeenCalledWith(expect.objectContaining({ id: 101, hidden: true }), 2);
    expect(screen.getByText('Save $3.00')).toBeInTheDocument();
  });

  it('scrolls to top and stores the product id in sessionStorage on mount', () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    renderProductPage();

    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
    expect(sessionStorage.getItem('productsScrollProductId')).toBe('101');

    scrollToSpy.mockRestore();
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
