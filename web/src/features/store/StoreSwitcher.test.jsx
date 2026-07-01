// web/src/features/store/StoreSwitcher.test.jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StoreSwitcher from './StoreSwitcher';

vi.mock('../../context/StoreSelectionContext', () => ({
  useStoreSelection: vi.fn(),
}));

vi.mock('../../context/AppContext', () => ({
  useApp: vi.fn(),
}));

import { useStoreSelection } from '../../context/StoreSelectionContext';
import { useApp } from '../../context/AppContext';

const STORES = [
  { id: 1, name: 'Downtown', slug: 'downtown', isDefault: true },
  { id: 2, name: 'Uptown', slug: 'uptown', isDefault: false },
];

const NON_ADMIN_USER = { id: 10, username: 'customer1', roles: ['CUSTOMER'] };
const ADMIN_USER = { id: 99, username: 'adminuser', roles: ['ADMIN'] };

describe('StoreSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: non-admin user — existing customer cases remain unchanged
    useApp.mockReturnValue({ currentUser: NON_ADMIN_USER });
  });

  describe('single-store tenant', () => {
    it('renders nothing when isMultiStore is false', () => {
      useStoreSelection.mockReturnValue({
        stores: [STORES[0]],
        activeStoreId: 1,
        isMultiStore: false,
        selectStore: vi.fn(),
        loading: false,
      });
      const { container } = render(<StoreSwitcher />);
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('multi-store tenant with active store (non-admin)', () => {
    beforeEach(() => {
      useStoreSelection.mockReturnValue({
        stores: STORES,
        activeStoreId: 1,
        isMultiStore: true,
        selectStore: vi.fn(),
        loading: false,
      });
    });

    it('renders the active store name in the trigger button', () => {
      render(<StoreSwitcher />);
      // activeStoreId=1 → STORES[0] → "Downtown"
      expect(screen.getByText('Downtown')).toBeInTheDocument();
    });

    it('does not show the dropdown listbox initially', () => {
      render(<StoreSwitcher />);
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('opens the dropdown when the trigger button is clicked', () => {
      render(<StoreSwitcher />);
      fireEvent.click(screen.getByRole('button', { name: /current store/i }));
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('calls selectStore with the clicked store id and closes the dropdown', () => {
      const selectStore = vi.fn();
      useStoreSelection.mockReturnValue({
        stores: STORES,
        activeStoreId: 1,
        isMultiStore: true,
        selectStore,
        loading: false,
      });
      render(<StoreSwitcher />);
      // Open the dropdown
      fireEvent.click(screen.getByRole('button', { name: /current store/i }));
      // Click the inactive store (Uptown = id 2)
      fireEvent.click(screen.getByRole('option', { name: 'Uptown' }));
      expect(selectStore).toHaveBeenCalledOnce();
      expect(selectStore).toHaveBeenCalledWith(2);
      // Dropdown must close after selection
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('non-admin does NOT see "All stores" option', () => {
      render(<StoreSwitcher />);
      fireEvent.click(screen.getByRole('button', { name: /current store/i }));
      expect(screen.queryByRole('option', { name: 'All stores' })).not.toBeInTheDocument();
    });
  });

  describe('admin user — All stores option', () => {
    beforeEach(() => {
      useApp.mockReturnValue({ currentUser: ADMIN_USER });
      useStoreSelection.mockReturnValue({
        stores: STORES,
        activeStoreId: 1,
        isMultiStore: true,
        selectStore: vi.fn(),
        loading: false,
      });
    });

    it('admin sees an "All stores" option in the dropdown', () => {
      render(<StoreSwitcher />);
      fireEvent.click(screen.getByRole('button', { name: /current store/i }));
      expect(screen.getByRole('option', { name: 'All stores' })).toBeInTheDocument();
    });

    it('clicking "All stores" calls selectStore(0) and closes dropdown', () => {
      const selectStore = vi.fn();
      useStoreSelection.mockReturnValue({
        stores: STORES,
        activeStoreId: 1,
        isMultiStore: true,
        selectStore,
        loading: false,
      });
      render(<StoreSwitcher />);
      fireEvent.click(screen.getByRole('button', { name: /current store/i }));
      fireEvent.click(screen.getByRole('option', { name: 'All stores' }));
      expect(selectStore).toHaveBeenCalledOnce();
      expect(selectStore).toHaveBeenCalledWith(0);
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('activeStoreId === 0 (All stores active)', () => {
    it('shows "All stores" as the active label in the trigger button', () => {
      useApp.mockReturnValue({ currentUser: ADMIN_USER });
      useStoreSelection.mockReturnValue({
        stores: STORES,
        activeStoreId: 0,
        isMultiStore: true,
        selectStore: vi.fn(),
        loading: false,
      });
      render(<StoreSwitcher />);
      expect(screen.getByText('All stores')).toBeInTheDocument();
    });

    it('"All stores" option is marked aria-selected when activeStoreId is 0', () => {
      useApp.mockReturnValue({ currentUser: ADMIN_USER });
      useStoreSelection.mockReturnValue({
        stores: STORES,
        activeStoreId: 0,
        isMultiStore: true,
        selectStore: vi.fn(),
        loading: false,
      });
      render(<StoreSwitcher />);
      // Open dropdown — trigger aria-label reflects "All stores" when activeStoreId=0
      fireEvent.click(screen.getByRole('button', { name: /current store: all stores/i }));
      const allStoresOption = screen.getByRole('option', { name: 'All stores' });
      expect(allStoresOption).toHaveAttribute('aria-selected', 'true');
    });
  });
});
