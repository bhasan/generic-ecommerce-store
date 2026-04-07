import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, beforeEach, expect, it, vi } from 'vitest';
import LandingPage from './LandingPage';

const useAppMock = vi.fn();
vi.mock('../../context/AppContext', () => ({
  useApp: () => useAppMock(),
}));

const ProductsGridMock = vi.fn(({ products }) => (
  <ul>{products.map(p => <li key={p.id}>{p.name}</li>)}</ul>
));
vi.mock('../products/ProductsGrid', () => ({
  default: (props) => ProductsGridMock(props),
}));

vi.mock('./PromotionsCarousel', () => ({
  default: ({ slides }) => <div data-testid="promotions-carousel">{slides.length} slides</div>,
}));

const sampleProducts = [
  { id: 1, name: 'Blue Dream',   price: 10, sortOrder: 2, hidden: false, category: { name: 'Flower' } },
  { id: 2, name: 'OG Kush',     price: 12, sortOrder: 1, hidden: false, category: { name: 'Flower' } },
  { id: 3, name: 'Sour Diesel', price: 11, sortOrder: 3, hidden: false, category: { name: 'Vape' } },
];

const sampleCategories = [
  { id: 10, name: 'Flower', parentId: null, sortOrder: 1 },
  { id: 11, name: 'Vape',   parentId: null, sortOrder: 2 },
];

const baseAppState = {
  products: sampleProducts,
  categories: sampleCategories,
  isLoadingProducts: false,
  addToCart: vi.fn(),
  currentUser: { roles: ['CUSTOMER'] },
  featuredProductIds: [],
  promotions: [],
};

const renderPage = (appState = {}) =>
  render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );

describe('LandingPage', () => {
  beforeEach(() => {
    useAppMock.mockReturnValue({ ...baseAppState });
    vi.clearAllMocks();
    ProductsGridMock.mockImplementation(({ products }) => (
      <ul>{products.map(p => <li key={p.id}>{p.name}</li>)}</ul>
    ));
  });

  it('shows a loading state while products are loading', () => {
    useAppMock.mockReturnValue({ ...baseAppState, isLoadingProducts: true });
    renderPage();
    expect(screen.getByText(/loading products/i)).toBeInTheDocument();
  });

  it('shows the Featured Products heading when there is no search query', () => {
    renderPage();
    expect(screen.getByText('Featured Products')).toBeInTheDocument();
  });

  it('shows the fallback top-sorted products when featuredProductIds is empty', () => {
    renderPage();
    // sortOrder 1 = OG Kush, 2 = Blue Dream, 3 = Sour Diesel
    expect(screen.getByText('OG Kush')).toBeInTheDocument();
    expect(screen.getByText('Blue Dream')).toBeInTheDocument();
    expect(screen.getByText('Sour Diesel')).toBeInTheDocument();
  });

  it('shows only the configured featured products when featuredProductIds is set', () => {
    useAppMock.mockReturnValue({ ...baseAppState, featuredProductIds: [3, 1] });
    renderPage();
    expect(screen.getByText('Sour Diesel')).toBeInTheDocument();
    expect(screen.getByText('Blue Dream')).toBeInTheDocument();
    expect(screen.queryByText('OG Kush')).not.toBeInTheDocument();
  });

  it('shows search results with a count heading when a query of 2+ chars is typed', async () => {
    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/search products/i), {
      target: { value: 'kush' },
    });

    await waitFor(() =>
      expect(screen.getByText(/1 result.* for .kush/i)).toBeInTheDocument()
    );
    expect(screen.getByText('OG Kush')).toBeInTheDocument();
    expect(screen.queryByText('Blue Dream')).not.toBeInTheDocument();
  });

  it('shows no-results empty state when the search matches nothing', async () => {
    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/search products/i), {
      target: { value: 'zzznomatch' },
    });

    await waitFor(() =>
      expect(screen.getByText(/no products found/i)).toBeInTheDocument()
    );
  });

  it('does not search with a single character query', async () => {
    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/search products/i), {
      target: { value: 'k' },
    });

    // Still shows featured heading, not search results
    await waitFor(() =>
      expect(screen.getByText('Featured Products')).toBeInTheDocument()
    );
  });

  it('shows category pills when the query is empty', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Flower' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vape' })).toBeInTheDocument();
  });

  it('hides category pills when a query is active', async () => {
    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/search products/i), {
      target: { value: 'kush' },
    });

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Flower' })).not.toBeInTheDocument()
    );
  });

  it('clicking a category pill populates the search and shows results', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Flower' }));

    await waitFor(() =>
      expect(screen.getByDisplayValue('Flower')).toBeInTheDocument()
    );
    await waitFor(() =>
      expect(screen.queryByText('Featured Products')).not.toBeInTheDocument()
    );
  });

  it('clears the search when the X button is clicked', async () => {
    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/search products/i), {
      target: { value: 'kush' },
    });

    await waitFor(() => expect(screen.getByLabelText(/clear search/i)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/clear search/i));

    expect(screen.getByDisplayValue('')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Featured Products')).toBeInTheDocument());
  });

  it('renders the featured products grid with viewMode="grid"', () => {
    renderPage();
    expect(ProductsGridMock).toHaveBeenCalledWith(
      expect.objectContaining({ viewMode: 'grid' }),
    );
  });

  it('renders the search results grid with viewMode="grid"', async () => {
    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/search products/i), {
      target: { value: 'kush' },
    });

    await waitFor(() => expect(screen.queryByText('Featured Products')).not.toBeInTheDocument());
    const calls = ProductsGridMock.mock.calls.map(([props]) => props);
    expect(calls.every(p => p.viewMode === 'grid')).toBe(true);
  });

  it('renders the promotions carousel when slides are configured', () => {
    useAppMock.mockReturnValue({
      ...baseAppState,
      promotions: [
        { url: '/api/uploads/a.webp', description: 'Sale' },
        { url: '/api/uploads/b.webp', description: 'New arrivals' },
      ],
    });
    renderPage();
    expect(screen.getByTestId('promotions-carousel')).toBeInTheDocument();
    expect(screen.getByTestId('promotions-carousel')).toHaveTextContent('2 slides');
  });

  it('hides the promotions carousel when no slides are configured', () => {
    renderPage();
    expect(screen.queryByTestId('promotions-carousel')).not.toBeInTheDocument();
  });

  it('hides hidden products from customer users', () => {
    const hiddenProduct = { id: 4, name: 'Hidden Item', price: 5, sortOrder: 0, hidden: true, category: { name: 'Flower' } };
    useAppMock.mockReturnValue({
      ...baseAppState,
      products: [...sampleProducts, hiddenProduct],
    });

    renderPage();
    expect(screen.queryByText('Hidden Item')).not.toBeInTheDocument();
  });
});
