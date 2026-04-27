import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, beforeEach, expect, it, vi } from 'vitest';
import LandingPageSection from './LandingPageSection';

const useAppMock = vi.fn();
vi.mock('../../../context/AppContext', () => ({
  useApp: () => useAppMock(),
  AppProvider: ({ children }) => children,
}));

vi.mock('../../../components/common/MediaLibraryModal', () => ({
  default: ({ isOpen, onSelect, onClose }) =>
    isOpen ? (
      <div data-testid="media-library">
        <button onClick={() => onSelect('/api/uploads/promo.webp')}>Select Image</button>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

const sampleProducts = [
  { id: 1, name: 'Blue Dream', thumbnail: null },
  { id: 2, name: 'OG Kush', thumbnail: null },
  { id: 3, name: 'Sour Diesel', thumbnail: null },
];

const defaultSettings = { featuredProductIds: [], promotions: [] };

const renderSection = (props = {}) =>
  render(
    <LandingPageSection
      isLoading={false}
      landingPageSettings={defaultSettings}
      onSave={vi.fn()}
      {...props}
    />
  );

describe('LandingPageSection', () => {
  beforeEach(() => {
    useAppMock.mockReturnValue({ products: sampleProducts });
    vi.clearAllMocks();
  });

  // ── Loading ──────────────────────────────────
  it('shows a loading spinner when isLoading is true', () => {
    renderSection({ isLoading: true });
    expect(screen.getByText(/loading landing page settings/i)).toBeInTheDocument();
  });

  // ── Featured products ────────────────────────
  it('renders all available products in the left panel', () => {
    renderSection();
    expect(screen.getByText('Blue Dream')).toBeInTheDocument();
    expect(screen.getByText('OG Kush')).toBeInTheDocument();
    expect(screen.getByText('Sour Diesel')).toBeInTheDocument();
  });

  it('initializes with configured featured product IDs', () => {
    renderSection({ landingPageSettings: { featuredProductIds: [2], promotions: [] } });

    const lists = screen.getAllByRole('list');
    const availablePanel = lists[0];
    const featuredPanel = lists[1];
    expect(within(availablePanel).queryByText('OG Kush')).not.toBeInTheDocument();
    expect(within(featuredPanel).getByText('OG Kush')).toBeInTheDocument();
  });

  it('adds a product to the featured panel when the + button is clicked', () => {
    renderSection();

    fireEvent.click(screen.getAllByTitle('Add to featured')[0]);

    const lists = screen.getAllByRole('list');
    expect(within(lists[0]).queryByText('Blue Dream')).not.toBeInTheDocument();
    expect(within(lists[1]).getByText('Blue Dream')).toBeInTheDocument();
  });

  it('removes a product from the featured panel when the remove button is clicked', () => {
    renderSection({ landingPageSettings: { featuredProductIds: [1], promotions: [] } });

    fireEvent.click(screen.getByTitle('Remove'));

    const lists = screen.getAllByRole('list');
    expect(within(lists[0]).getByText('Blue Dream')).toBeInTheDocument();
    expect(within(lists[1]).queryByText('Blue Dream')).not.toBeInTheDocument();
  });

  it('moves a product up in the featured list', () => {
    renderSection({ landingPageSettings: { featuredProductIds: [1, 2], promotions: [] } });

    const [, featuredPanel] = screen.getAllByRole('list');
    expect(within(featuredPanel).getAllByRole('listitem')[0]).toHaveTextContent('Blue Dream');

    fireEvent.click(screen.getAllByTitle('Move up')[1]);

    expect(within(featuredPanel).getAllByRole('listitem')[0]).toHaveTextContent('OG Kush');
  });

  it('moves a product down in the featured list', () => {
    renderSection({ landingPageSettings: { featuredProductIds: [1, 2], promotions: [] } });

    const [, featuredPanel] = screen.getAllByRole('list');
    expect(within(featuredPanel).getAllByRole('listitem')[0]).toHaveTextContent('Blue Dream');

    fireEvent.click(screen.getAllByTitle('Move down')[0]);

    expect(within(featuredPanel).getAllByRole('listitem')[0]).toHaveTextContent('OG Kush');
  });

  it('disables add buttons when 12 products are already featured', () => {
    const twelveProducts = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Product ${i + 1}`, thumbnail: null }));
    const thirteenth = { id: 13, name: 'Product 13', thumbnail: null };
    useAppMock.mockReturnValue({ products: [...twelveProducts, thirteenth] });

    renderSection({ landingPageSettings: { featuredProductIds: twelveProducts.map(p => p.id), promotions: [] } });

    screen.getAllByTitle('Add to featured').forEach(btn => expect(btn).toBeDisabled());
  });

  it('filters the available products list by search query', () => {
    renderSection();

    fireEvent.change(screen.getByPlaceholderText(/search products/i), { target: { value: 'kush' } });

    const [availablePanel] = screen.getAllByRole('list');
    expect(within(availablePanel).getByText('OG Kush')).toBeInTheDocument();
    expect(within(availablePanel).queryByText('Blue Dream')).not.toBeInTheDocument();
  });

  // ── Promotions panel ─────────────────────────
  it('shows empty state text when no promotion slides exist', () => {
    renderSection();
    expect(screen.getByText(/no promotion slides yet/i)).toBeInTheDocument();
  });

  it('opens the media library when Add Slide is clicked', () => {
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: /add slide/i }));

    expect(screen.getByTestId('media-library')).toBeInTheDocument();
  });

  it('adds a promotion slide after selecting from the media library', () => {
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: /add slide/i }));
    fireEvent.click(screen.getByRole('button', { name: /select image/i }));

    expect(screen.queryByTestId('media-library')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/description/i)).toBeInTheDocument();
    expect(screen.queryByText(/no promotion slides yet/i)).not.toBeInTheDocument();
  });

  it('closes the media library without adding a slide when Close is clicked', () => {
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: /add slide/i }));
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));

    expect(screen.queryByTestId('media-library')).not.toBeInTheDocument();
    expect(screen.getByText(/no promotion slides yet/i)).toBeInTheDocument();
  });

  it('updates the description of a promotion slide', () => {
    renderSection({ landingPageSettings: { featuredProductIds: [], promotions: [{ url: '/api/uploads/p.webp', description: '' }] } });

    fireEvent.change(screen.getByPlaceholderText(/description/i), { target: { value: 'Summer sale' } });

    expect(screen.getByDisplayValue('Summer sale')).toBeInTheDocument();
  });

  it('removes a promotion slide when its remove button is clicked', () => {
    renderSection({ landingPageSettings: { featuredProductIds: [], promotions: [{ url: '/api/uploads/p.webp', description: 'Sale' }] } });

    fireEvent.click(screen.getByTitle('Remove slide'));

    expect(screen.getByText(/no promotion slides yet/i)).toBeInTheDocument();
  });

  it('reorders promotion slides with move up/down', () => {
    renderSection({
      landingPageSettings: {
        featuredProductIds: [],
        promotions: [
          { url: '/api/uploads/a.webp', description: 'First' },
          { url: '/api/uploads/b.webp', description: 'Second' },
        ],
      },
    });

    const inputs = screen.getAllByPlaceholderText(/description/i);
    expect(inputs[0]).toHaveValue('First');
    expect(inputs[1]).toHaveValue('Second');

    // Click move-up on the second slide (index 1) to bring it above the first
    fireEvent.click(screen.getAllByTitle('Move up')[1]);

    const reordered = screen.getAllByPlaceholderText(/description/i);
    expect(reordered[0]).toHaveValue('Second');
    expect(reordered[1]).toHaveValue('First');
  });

  // ── Save ─────────────────────────────────────
  it('calls onSave with both featuredProductIds and promotions', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderSection({
      landingPageSettings: {
        featuredProductIds: [3, 1],
        promotions: [{ url: '/api/uploads/p.webp', description: 'Sale' }],
      },
      onSave,
    });

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      featuredProductIds: [3, 1],
      promotions: [{ url: '/api/uploads/p.webp', description: 'Sale' }],
    }));
  });
});
