// web/src/features/store/StorePicker.test.jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StorePicker from './StorePicker';

vi.mock('../../context/StoreSelectionContext', () => ({
  useStoreSelection: vi.fn(),
}));

import { useStoreSelection } from '../../context/StoreSelectionContext';

const STORES = [
  { id: 1, name: 'Downtown', slug: 'downtown', isDefault: true },
  { id: 2, name: 'Uptown', slug: 'uptown', isDefault: false },
];

describe('StorePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('multi-store + no selection (gating modal shown)', () => {
    beforeEach(() => {
      useStoreSelection.mockReturnValue({
        stores: STORES,
        activeStoreId: null,
        isMultiStore: true,
        selectStore: vi.fn(),
        loading: false,
      });
    });

    it('renders the "Choose your location" title', () => {
      render(<StorePicker />);
      expect(screen.getByText('Choose your location')).toBeInTheDocument();
    });

    it('renders all store names as selectable items', () => {
      render(<StorePicker />);
      expect(screen.getByText('Downtown')).toBeInTheDocument();
      expect(screen.getByText('Uptown')).toBeInTheDocument();
    });

    it('calls selectStore with the correct id when a store card is clicked', () => {
      const selectStore = vi.fn();
      useStoreSelection.mockReturnValue({
        stores: STORES,
        activeStoreId: null,
        isMultiStore: true,
        selectStore,
        loading: false,
      });
      render(<StorePicker />);
      fireEvent.click(screen.getByText('Downtown'));
      expect(selectStore).toHaveBeenCalledOnce();
      expect(selectStore).toHaveBeenCalledWith(1);
    });

    it('calls selectStore with the correct id for the second store', () => {
      const selectStore = vi.fn();
      useStoreSelection.mockReturnValue({
        stores: STORES,
        activeStoreId: null,
        isMultiStore: true,
        selectStore,
        loading: false,
      });
      render(<StorePicker />);
      fireEvent.click(screen.getByText('Uptown'));
      expect(selectStore).toHaveBeenCalledOnce();
      expect(selectStore).toHaveBeenCalledWith(2);
    });

    it('shows a subtitle prompt line', () => {
      render(<StorePicker />);
      expect(screen.getByText(/select a store/i)).toBeInTheDocument();
    });
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
      const { container } = render(<StorePicker />);
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('store already selected', () => {
    it('renders nothing when activeStoreId is set (multi-store tenant)', () => {
      useStoreSelection.mockReturnValue({
        stores: STORES,
        activeStoreId: 1,
        isMultiStore: true,
        selectStore: vi.fn(),
        loading: false,
      });
      const { container } = render(<StorePicker />);
      expect(container).toBeEmptyDOMElement();
    });
  });
});
