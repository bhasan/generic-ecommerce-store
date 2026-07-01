// web/src/features/store/StoreSwitcher.test.jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StoreSwitcher from './StoreSwitcher';

vi.mock('../../context/StoreSelectionContext', () => ({
  useStoreSelection: vi.fn(),
}));

import { useStoreSelection } from '../../context/StoreSelectionContext';

const STORES = [
  { id: 1, name: 'Downtown', slug: 'downtown', isDefault: true },
  { id: 2, name: 'Uptown', slug: 'uptown', isDefault: false },
];

describe('StoreSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  describe('multi-store tenant with active store', () => {
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
  });
});
