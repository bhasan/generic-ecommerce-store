import React from 'react';
import { describe, beforeEach, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import OrderPickupNotice from './OrderPickupNotice';

let appState;
const navigate = vi.fn();

vi.mock('../../context/AppContext', () => ({
  useApp: () => appState,
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

describe('OrderPickupNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    appState = {
      isAuthenticated: true,
      orders: [],
    };
  });

  it('renders nothing when there are no ready orders', () => {
    renderWithProviders(<OrderPickupNotice />);
    expect(screen.queryByText(/orders are ready for pickup/i)).not.toBeInTheDocument();
  });

  it('renders nothing when not authenticated even if orders are present', () => {
    appState.isAuthenticated = false;
    appState.orders = [{ id: 1, status: 'READY_FOR_PICKUP' }];
    renderWithProviders(<OrderPickupNotice />);
    expect(screen.queryByText(/orders are ready for pickup/i)).not.toBeInTheDocument();
  });

  it('renders the notice when a user has a ready for pickup order', () => {
    appState.orders = [{ id: 1, status: 'READY_FOR_PICKUP' }];
    renderWithProviders(<OrderPickupNotice />);
    expect(screen.getByText(/one or more of your orders are ready for pickup/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view orders/i })).toBeInTheDocument();
  });

  it('navigates to orders page when clicking the banner content', () => {
    appState.orders = [{ id: 1, status: 'READY_FOR_PICKUP' }];
    renderWithProviders(<OrderPickupNotice />);
    fireEvent.click(screen.getByText(/one or more of your orders are ready for pickup/i));
    expect(navigate).toHaveBeenCalledWith('/orders');
  });

  it('navigates to orders page when clicking the View Orders button', () => {
    appState.orders = [{ id: 1, status: 'READY_FOR_PICKUP' }];
    renderWithProviders(<OrderPickupNotice />);
    fireEvent.click(screen.getByRole('button', { name: /view orders/i }));
    expect(navigate).toHaveBeenCalledWith('/orders');
  });

  it('hides the notice and sets sessionStorage when clicking the close button', () => {
    appState.orders = [{ id: 1, status: 'READY_FOR_PICKUP' }];
    renderWithProviders(<OrderPickupNotice />);
    
    const closeBtn = screen.getByLabelText(/dismiss/i);
    fireEvent.click(closeBtn);
    
    expect(screen.queryByText(/one or more of your orders are ready for pickup/i)).not.toBeInTheDocument();
    expect(sessionStorage.getItem('pickupNoticeMuted')).toBe('true');
  });

  it('does not render if muted in sessionStorage', () => {
    sessionStorage.setItem('pickupNoticeMuted', 'true');
    appState.orders = [{ id: 1, status: 'READY_FOR_PICKUP' }];
    
    renderWithProviders(<OrderPickupNotice />);
    expect(screen.queryByText(/one or more of your orders are ready for pickup/i)).not.toBeInTheDocument();
  });
});
