import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductsPage from './ProductsPage';
import { ROLES } from '../../utils/roles';

// ── Mocks ──────────────────────────────────────────────────────────────────

const useAppMock = vi.fn();
vi.mock('../../context/AppContext', () => ({ useApp: () => useAppMock() }));

// Capture the products prop passed to ProductsGrid so we can assert on it.
const capturedGridProps = { products: null };
vi.mock('./ProductsGrid', () => ({
  default: (props) => {
    capturedGridProps.products = props.products;
    return (
      <div data-testid="products-grid">
        {props.products.map((p) => (
          <button
            key={p.id}
            data-testid={`product-card-${p.id}`}
            onClick={() => props.onProductClick(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>
    );
  },
}));

vi.mock('./CategorySection', () => ({
  default: ({ parent, productsByCategory, onProductClick }) => (
    <div data-testid={`category-section-${parent.id}`}>
      {(productsByCategory[parent.id] || []).map((p) => (
        <button
          key={p.id}
          data-testid={`product-card-${p.id}`}
          onClick={() => onProductClick(p.id)}
        >
          {p.name}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('./CategoryNav', () => ({ default: () => <nav data-testid="category-nav" /> }));

vi.mock('./ProductItemModal', () => ({
  default: ({ productId, onClose }) => (
    <div data-testid="product-modal">
      <span>Modal for product #{productId}</span>
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

vi.mock('./ManageProductsPanel', () => ({ default: () => <div>ManageProductsPanel</div> }));
vi.mock('../../components/common/EmptyState', () => ({ default: ({ message }) => <p>{message}</p> }));
vi.mock('../../components/common/HeaderDivider', () => ({ default: () => <hr /> }));

// ── Fixtures ───────────────────────────────────────────────────────────────

const visibleProduct = { id: 1, name: 'Blue Dream', price: 12.5, hidden: false, categoryId: null, reviews: [] };
const hiddenProduct = { id: 2, name: 'Secret Stash', price: 9.0, hidden: true, categoryId: null, reviews: [] };

const makeAppState = (currentUser, overrides = {}) => ({
  currentUser,
  products: [visibleProduct, hiddenProduct],
  addToCart: vi.fn(),
  isLoadingProducts: false,
  categories: [],
  isLoadingCategories: false,
  loadCategories: vi.fn(),
  ...overrides,
});

const renderProductsPage = (mode = 'browse') =>
  render(
    <MemoryRouter>
      <ProductsPage mode={mode} />
    </MemoryRouter>
  );

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ProductsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedGridProps.products = null;
  });

  describe('DOM structure (CSS mobile targets)', () => {
    it('renders the page inside .products-page-container', () => {
      useAppMock.mockReturnValue(
        makeAppState({ id: 1, username: 'customer', roles: [ROLES.CUSTOMER] })
      );
      const { container } = renderProductsPage();

      expect(container.querySelector('.products-page-container')).toBeTruthy();
    });
  });

  describe('customer role', () => {
    beforeEach(() => {
      useAppMock.mockReturnValue(
        makeAppState({ id: 1, username: 'customer', roles: [ROLES.CUSTOMER] })
      );
    });

    it('filters hidden products before passing them to the grid', () => {
      renderProductsPage();

      expect(capturedGridProps.products).not.toBeNull();
      const ids = capturedGridProps.products.map((p) => p.id);
      expect(ids).toContain(visibleProduct.id);
      expect(ids).not.toContain(hiddenProduct.id);
    });

    it('renders the visible product and not the hidden one', () => {
      renderProductsPage();

      expect(screen.getByTestId(`product-card-${visibleProduct.id}`)).toBeInTheDocument();
      expect(screen.queryByTestId(`product-card-${hiddenProduct.id}`)).not.toBeInTheDocument();
    });

    it('shows the loading state while products or categories are loading', () => {
      useAppMock.mockReturnValue(
        makeAppState(
          { id: 1, username: 'customer', roles: [ROLES.CUSTOMER] },
          { isLoadingProducts: true }
        )
      );
      renderProductsPage();

      expect(screen.getByText('Loading products...')).toBeInTheDocument();
    });

    it('opens the product modal when a product card is clicked', () => {
      renderProductsPage();

      fireEvent.click(screen.getByTestId(`product-card-${visibleProduct.id}`));

      expect(screen.getByTestId('product-modal')).toBeInTheDocument();
      expect(screen.getByText(`Modal for product #${visibleProduct.id}`)).toBeInTheDocument();
    });

    it('closes the product modal when close is triggered', () => {
      renderProductsPage();

      fireEvent.click(screen.getByTestId(`product-card-${visibleProduct.id}`));
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));

      expect(screen.queryByTestId('product-modal')).not.toBeInTheDocument();
    });

    it('does not call loadCategories on mount (loaded centrally in AppContext)', () => {
      const state = makeAppState({ id: 1, username: 'customer', roles: [ROLES.CUSTOMER] });
      useAppMock.mockReturnValue(state);
      renderProductsPage();

      expect(state.loadCategories).not.toHaveBeenCalled();
    });
  });

  describe('management role', () => {
    it('shows all products including hidden ones for management', () => {
      useAppMock.mockReturnValue(
        makeAppState({ id: 3, username: 'manager', roles: [ROLES.MANAGEMENT] })
      );
      renderProductsPage();

      const ids = capturedGridProps.products.map((p) => p.id);
      expect(ids).toContain(visibleProduct.id);
      expect(ids).toContain(hiddenProduct.id);
    });
  });
});
