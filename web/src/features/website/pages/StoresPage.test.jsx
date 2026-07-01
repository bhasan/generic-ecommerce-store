import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StoresPage from './StoresPage';
import * as storesApi from '../../../services/storesApi';

vi.mock('../../../services/storesApi', () => ({
  getManagedStores: vi.fn(),
  createStore: vi.fn(),
  updateStore: vi.fn(),
  setDefaultStore: vi.fn(),
  cloneFromDefault: vi.fn(),
}));

const SAMPLE = [
  {
    id: 1,
    name: 'Main Store',
    slug: 'main-store',
    isDefault: true,
    status: 'ACTIVE',
  },
  {
    id: 2,
    name: 'East Side',
    slug: 'east-side',
    isDefault: false,
    status: 'SUSPENDED',
  },
];

describe('StoresPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storesApi.getManagedStores).mockResolvedValue(SAMPLE);
    vi.mocked(storesApi.createStore).mockResolvedValue({ id: 3, name: 'New Store', slug: 'new-store', isDefault: false, status: 'ACTIVE' });
    vi.mocked(storesApi.updateStore).mockResolvedValue({});
    vi.mocked(storesApi.setDefaultStore).mockResolvedValue({});
    vi.mocked(storesApi.cloneFromDefault).mockResolvedValue({ overridesCopied: 0, settingsCopied: 0 });
  });

  it('renders the store list from getManagedStores on mount', async () => {
    render(<StoresPage />);
    expect(await screen.findByText('Main Store')).toBeInTheDocument();
    expect(screen.getByText('East Side')).toBeInTheDocument();
    expect(screen.getByText('main-store')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('SUSPENDED')).toBeInTheDocument();
    expect(storesApi.getManagedStores).toHaveBeenCalled();
  });

  it('shows the Default badge for the default store', async () => {
    render(<StoresPage />);
    await screen.findByText('Main Store');
    // The badge is a <span>; the column header is a <th> — match the span only.
    expect(screen.getByRole('cell', { name: /^Default$/ })).toBeInTheDocument();
  });

  it('submitting the create form calls createStore with { name, slug }', async () => {
    render(<StoresPage />);
    await screen.findByText('Main Store');

    fireEvent.change(screen.getByLabelText(/^Name$/i), { target: { value: 'New Store' } });
    fireEvent.change(screen.getByLabelText(/^Slug$/i), { target: { value: 'new-store' } });
    fireEvent.click(screen.getByRole('button', { name: /Create store/i }));

    await waitFor(() =>
      expect(storesApi.createStore).toHaveBeenCalledWith({ name: 'New Store', slug: 'new-store' })
    );
  });

  it('clicking "Clone from default" calls cloneFromDefault with the store id', async () => {
    render(<StoresPage />);
    await screen.findByText('Main Store');

    // There are two "Clone from default" buttons — click the second one (East Side, id:2).
    const cloneBtns = screen.getAllByRole('button', { name: /Clone from default/i });
    fireEvent.click(cloneBtns[1]);

    await waitFor(() =>
      expect(storesApi.cloneFromDefault).toHaveBeenCalledWith(2)
    );
  });

  it('clicking "Make default" calls setDefaultStore with the store id', async () => {
    render(<StoresPage />);
    await screen.findByText('Main Store');

    // Only non-default stores have a "Make default" button (East Side, id:2).
    fireEvent.click(screen.getByRole('button', { name: /Make default/i }));

    await waitFor(() =>
      expect(storesApi.setDefaultStore).toHaveBeenCalledWith(2)
    );
  });

  it('clicking "Suspend" calls updateStore with status SUSPENDED', async () => {
    render(<StoresPage />);
    await screen.findByText('Main Store');

    // Main Store is ACTIVE, so it shows a Suspend button.
    fireEvent.click(screen.getByRole('button', { name: /^Suspend$/i }));

    await waitFor(() =>
      expect(storesApi.updateStore).toHaveBeenCalledWith(1, { status: 'SUSPENDED' })
    );
  });

  it('clicking "Activate" calls updateStore with status ACTIVE', async () => {
    render(<StoresPage />);
    await screen.findByText('Main Store');

    // East Side is SUSPENDED, so it shows an Activate button.
    fireEvent.click(screen.getByRole('button', { name: /^Activate$/i }));

    await waitFor(() =>
      expect(storesApi.updateStore).toHaveBeenCalledWith(2, { status: 'ACTIVE' })
    );
  });

  it('surfaces a visible error when createStore fails', async () => {
    vi.mocked(storesApi.createStore).mockRejectedValue(new Error('slug already exists'));

    render(<StoresPage />);
    await screen.findByText('Main Store');

    fireEvent.change(screen.getByLabelText(/^Name$/i), { target: { value: 'Dup' } });
    fireEvent.change(screen.getByLabelText(/^Slug$/i), { target: { value: 'main-store' } });
    fireEvent.click(screen.getByRole('button', { name: /Create store/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/slug already exists/i);
  });
});
