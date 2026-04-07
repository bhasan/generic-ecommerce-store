import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, beforeEach, expect, it, vi } from 'vitest';
import LandingPageSection from './LandingPageSection';

const useAppMock = vi.fn();
vi.mock('../../../context/AppContext', () => ({
  useApp: () => useAppMock(),
}));

const sampleProducts = [
  { id: 1, name: 'Blue Dream', thumbnail: null },
  { id: 2, name: 'OG Kush', thumbnail: null },
  { id: 3, name: 'Sour Diesel', thumbnail: null },
];

const renderSection = (props = {}) =>
  render(
    <LandingPageSection
      isLoading={false}
      landingPageSettings={{ featuredProductIds: [] }}
      onSave={vi.fn()}
      {...props}
    />
  );

describe('LandingPageSection', () => {
  beforeEach(() => {
    useAppMock.mockReturnValue({ products: sampleProducts });
    vi.clearAllMocks();
  });

  it('shows a loading spinner when isLoading is true', () => {
    renderSection({ isLoading: true });
    expect(screen.getByText(/loading landing page settings/i)).toBeInTheDocument();
  });

  it('renders all available products in the left panel', () => {
    renderSection();
    expect(screen.getByText('Blue Dream')).toBeInTheDocument();
    expect(screen.getByText('OG Kush')).toBeInTheDocument();
    expect(screen.getByText('Sour Diesel')).toBeInTheDocument();
  });

  it('initializes with configured featured product IDs', () => {
    renderSection({ landingPageSettings: { featuredProductIds: [2] } });

    const [availablePanel, featuredPanel] = screen.getAllByRole('list');
    expect(within(availablePanel).queryByText('OG Kush')).not.toBeInTheDocument();
    expect(within(featuredPanel).getByText('OG Kush')).toBeInTheDocument();
  });

  it('adds a product to the featured panel when the + button is clicked', () => {
    renderSection();

    const addButtons = screen.getAllByTitle('Add to featured');
    fireEvent.click(addButtons[0]); // add Blue Dream

    const [availablePanel, featuredPanel] = screen.getAllByRole('list');
    expect(within(availablePanel).queryByText('Blue Dream')).not.toBeInTheDocument();
    expect(within(featuredPanel).getByText('Blue Dream')).toBeInTheDocument();
  });

  it('removes a product from the featured panel when the remove button is clicked', () => {
    renderSection({ landingPageSettings: { featuredProductIds: [1] } });

    fireEvent.click(screen.getByTitle('Remove'));

    const [availablePanel, featuredPanel] = screen.getAllByRole('list');
    expect(within(availablePanel).getByText('Blue Dream')).toBeInTheDocument();
    expect(within(featuredPanel).queryByText('Blue Dream')).not.toBeInTheDocument();
  });

  it('moves a product up in the featured list', () => {
    renderSection({ landingPageSettings: { featuredProductIds: [1, 2] } });

    const [, featuredPanel] = screen.getAllByRole('list');
    const items = within(featuredPanel).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Blue Dream');
    expect(items[1]).toHaveTextContent('OG Kush');

    fireEvent.click(screen.getAllByTitle('Move up')[1]); // move OG Kush up

    const reorderedItems = within(featuredPanel).getAllByRole('listitem');
    expect(reorderedItems[0]).toHaveTextContent('OG Kush');
    expect(reorderedItems[1]).toHaveTextContent('Blue Dream');
  });

  it('moves a product down in the featured list', () => {
    renderSection({ landingPageSettings: { featuredProductIds: [1, 2] } });

    const [, featuredPanel] = screen.getAllByRole('list');
    const items = within(featuredPanel).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Blue Dream');

    fireEvent.click(screen.getAllByTitle('Move down')[0]); // move Blue Dream down

    const reorderedItems = within(featuredPanel).getAllByRole('listitem');
    expect(reorderedItems[0]).toHaveTextContent('OG Kush');
    expect(reorderedItems[1]).toHaveTextContent('Blue Dream');
  });

  it('disables add buttons when 12 products are already featured', () => {
    const twelveProducts = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      name: `Product ${i + 1}`,
      thumbnail: null,
    }));
    const thirteenthProduct = { id: 13, name: 'Product 13', thumbnail: null };
    useAppMock.mockReturnValue({ products: [...twelveProducts, thirteenthProduct] });

    renderSection({
      landingPageSettings: { featuredProductIds: twelveProducts.map(p => p.id) },
    });

    const addButtons = screen.getAllByTitle('Add to featured');
    addButtons.forEach(btn => expect(btn).toBeDisabled());
  });

  it('calls onSave with the current featuredProductIds when Save is clicked', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderSection({ landingPageSettings: { featuredProductIds: [3, 1] }, onSave });

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ featuredProductIds: [3, 1] }));
  });

  it('filters the available products list by search query', () => {
    renderSection();

    fireEvent.change(screen.getByPlaceholderText(/search products/i), {
      target: { value: 'kush' },
    });

    const [availablePanel] = screen.getAllByRole('list');
    expect(within(availablePanel).getByText('OG Kush')).toBeInTheDocument();
    expect(within(availablePanel).queryByText('Blue Dream')).not.toBeInTheDocument();
  });
});
