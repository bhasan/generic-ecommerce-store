import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StoreInventoryPage from './StoreInventoryPage';
import * as storesApi from '../../../services/storesApi';
import * as storeOverridesApi from '../../../services/storeOverridesApi';

vi.mock('../../../services/storesApi', () => ({
  getManagedStores: vi.fn(),
}));

vi.mock('../../../services/storeOverridesApi', () => ({
  getStoreOverrides: vi.fn(),
  upsertStoreOverride: vi.fn(),
  deleteStoreOverride: vi.fn(),
}));

const STORES = [
  { id: 1, name: 'Main Store', slug: 'main', isDefault: true, status: 'ACTIVE' },
  { id: 2, name: 'East Side', slug: 'east-side', isDefault: false, status: 'ACTIVE' },
];

const OVERRIDE_DATA = {
  storeId: 2,
  overrides: [
    { variantId: 10, stock: 5, priceOverride: 9.99, activeOverride: true },
  ],
  variants: [
    { id: 10, productName: 'Smoke Special', label: 'Regular', basePrice: 12.00, stock: 20, active: true },
    { id: 11, productName: 'Blue Dream', label: 'Large', basePrice: 25.00, stock: 10, active: true },
  ],
};

describe('StoreInventoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storesApi.getManagedStores).mockResolvedValue(STORES);
    vi.mocked(storeOverridesApi.getStoreOverrides).mockResolvedValue(OVERRIDE_DATA);
    vi.mocked(storeOverridesApi.upsertStoreOverride).mockResolvedValue({});
    vi.mocked(storeOverridesApi.deleteStoreOverride).mockResolvedValue({});
  });

  it('renders store selector on mount and loads stores', async () => {
    render(<StoreInventoryPage />);
    // Selector appears after stores load
    expect(await screen.findByLabelText(/select store/i)).toBeInTheDocument();
    expect(screen.getByText(/Main Store/)).toBeInTheDocument();
    expect(screen.getByText(/East Side/)).toBeInTheDocument();
  });

  it('selecting a non-default store loads getStoreOverrides and renders variant rows', async () => {
    render(<StoreInventoryPage />);
    await screen.findByLabelText(/select store/i);

    fireEvent.change(screen.getByLabelText(/select store/i), { target: { value: '2' } });

    expect(storeOverridesApi.getStoreOverrides).toHaveBeenCalledWith('2');

    // Both variants appear in the table
    expect(await screen.findByText('Smoke Special')).toBeInTheDocument();
    expect(screen.getByText('Blue Dream')).toBeInTheDocument();

    // Base prices are rendered (may appear in both base-price and effective columns)
    expect(screen.getByText('$12.00')).toBeInTheDocument();
    // $25.00 appears in the base-price <td> and also in the effective <div>
    expect(screen.getAllByText('$25.00').length).toBeGreaterThanOrEqual(1);
  });

  it('pre-populates override fields from fetched override data', async () => {
    render(<StoreInventoryPage />);
    await screen.findByLabelText(/select store/i);

    fireEvent.change(screen.getByLabelText(/select store/i), { target: { value: '2' } });
    await screen.findByText('Smoke Special');

    // Override price field for variant 10 should be pre-populated with 9.99
    const priceInputs = screen.getAllByLabelText(/override price for Smoke Special/i);
    expect(priceInputs[0]).toHaveValue(9.99);

    // Stock override for variant 10 should be 5
    const stockInputs = screen.getAllByLabelText(/override stock for Smoke Special/i);
    expect(stockInputs[0]).toHaveValue(5);
  });

  it('editing stock and saving calls upsertStoreOverride with correct payload', async () => {
    render(<StoreInventoryPage />);
    await screen.findByLabelText(/select store/i);

    fireEvent.change(screen.getByLabelText(/select store/i), { target: { value: '2' } });
    await screen.findByText('Blue Dream');

    // Edit stock for Blue Dream (variantId 11, no existing override)
    const stockInput = screen.getByLabelText(/override stock for Blue Dream/i);
    fireEvent.change(stockInput, { target: { value: '15' } });

    // Click Save for that row
    const saveButtons = screen.getAllByRole('button', { name: /save override for Blue Dream/i });
    fireEvent.click(saveButtons[0]);

    await waitFor(() =>
      expect(storeOverridesApi.upsertStoreOverride).toHaveBeenCalledWith(
        expect.objectContaining({ storeId: 2, variantId: 11, stock: 15 })
      )
    );
  });

  it('clicking "Clear" calls deleteStoreOverride with storeId and variantId', async () => {
    render(<StoreInventoryPage />);
    await screen.findByLabelText(/select store/i);

    fireEvent.change(screen.getByLabelText(/select store/i), { target: { value: '2' } });
    await screen.findByText('Smoke Special');

    // Variant 10 has an override so a "Clear" button exists for it
    const clearButton = screen.getByRole('button', { name: /clear override for Smoke Special/i });
    fireEvent.click(clearButton);

    await waitFor(() =>
      expect(storeOverridesApi.deleteStoreOverride).toHaveBeenCalledWith(2, 10)
    );
  });

  it('selecting the default store shows the read-only notice and does NOT call getStoreOverrides', async () => {
    render(<StoreInventoryPage />);
    await screen.findByLabelText(/select store/i);

    fireEvent.change(screen.getByLabelText(/select store/i), { target: { value: '1' } });

    expect(await screen.findByRole('note')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/default store/i);
    expect(storeOverridesApi.getStoreOverrides).not.toHaveBeenCalled();
  });

  it('surfaces an API error in a role=alert when getStoreOverrides fails', async () => {
    vi.mocked(storeOverridesApi.getStoreOverrides).mockRejectedValue(
      new Error('store not found')
    );

    render(<StoreInventoryPage />);
    await screen.findByLabelText(/select store/i);

    fireEvent.change(screen.getByLabelText(/select store/i), { target: { value: '2' } });

    expect(await screen.findByRole('alert')).toHaveTextContent(/store not found/i);
  });

  it('surfaces a row-level error in a role=alert when upsertStoreOverride fails', async () => {
    vi.mocked(storeOverridesApi.upsertStoreOverride).mockRejectedValue(
      new Error('invalid price override')
    );

    render(<StoreInventoryPage />);
    await screen.findByLabelText(/select store/i);
    fireEvent.change(screen.getByLabelText(/select store/i), { target: { value: '2' } });
    await screen.findByText('Blue Dream');

    const saveButtons = screen.getAllByRole('button', { name: /save override for Blue Dream/i });
    fireEvent.click(saveButtons[0]);

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid price override/i);
  });
});
