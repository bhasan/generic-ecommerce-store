import React from 'react';
import { describe, beforeEach, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import CustomerArrivedNotice from './CustomerArrivedNotice';
import { ROLES } from '../../utils/roles';

let appState;
const navigate = vi.fn();

vi.mock('../../context/AppContext', () => ({
  useApp: () => appState,
  AppProvider: ({ children }) => children,
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

describe('CustomerArrivedNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    appState = {
      isAuthenticated: true,
      currentUser: { id: 1, username: 'manager-one', roles: [ROLES.MANAGEMENT] },
      orders: [],
    };
  });

  it('renders nothing when there are no arrived orders', () => {
    renderWithProviders(<CustomerArrivedNotice />);
    expect(screen.queryByText(/has arrived for pickup/i)).not.toBeInTheDocument();
  });

  it('renders nothing when not authenticated even if orders are present', () => {
    appState.isAuthenticated = false;
    appState.orders = [{ id: 1, status: 'ARRIVED', user: { username: 'alice' } }];
    renderWithProviders(<CustomerArrivedNotice />);
    expect(screen.queryByText(/has arrived for pickup/i)).not.toBeInTheDocument();
  });

  it('renders nothing for customer users even if arrived orders are present', () => {
    appState.currentUser = { id: 2, username: 'alice', roles: [ROLES.CUSTOMER] };
    appState.orders = [{ id: 1, status: 'ARRIVED', user: { username: 'alice' } }];
    renderWithProviders(<CustomerArrivedNotice />);
    expect(screen.queryByText(/has arrived for pickup/i)).not.toBeInTheDocument();
  });

  it('renders the notice for staff when a customer has arrived', () => {
    appState.orders = [{ id: 1, status: 'ARRIVED', user: { username: 'alice' } }];
    renderWithProviders(<CustomerArrivedNotice />);
    expect(screen.getByText(/Customer alice has arrived for pickup!/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view orders/i })).toBeInTheDocument();
  });

  it('renders plural text when multiple customers have arrived', () => {
    appState.orders = [
      { id: 1, status: 'ARRIVED', user: { username: 'alice' } },
      { id: 2, status: 'ARRIVED', user: { username: 'bob' } }
    ];
    renderWithProviders(<CustomerArrivedNotice />);
    expect(screen.getByText(/2 customers \(alice, bob\) have arrived for pickup!/i)).toBeInTheDocument();
  });

  it('navigates to arrived status orders page when clicking the banner content', () => {
    appState.orders = [{ id: 1, status: 'ARRIVED', user: { username: 'alice' } }];
    renderWithProviders(<CustomerArrivedNotice />);
    fireEvent.click(screen.getByText(/Customer alice has arrived for pickup!/i));
    expect(navigate).toHaveBeenCalledWith('/orders?status=ARRIVED');
  });

  it('navigates to arrived status orders page when clicking the View Orders button', () => {
    appState.orders = [{ id: 1, status: 'ARRIVED', user: { username: 'alice' } }];
    renderWithProviders(<CustomerArrivedNotice />);
    fireEvent.click(screen.getByRole('button', { name: /view orders/i }));
    expect(navigate).toHaveBeenCalledWith('/orders?status=ARRIVED');
  });

  it('hides the notice and sets sessionStorage when clicking the close button', () => {
    appState.orders = [{ id: 1, status: 'ARRIVED', user: { username: 'alice' } }];
    renderWithProviders(<CustomerArrivedNotice />);
    
    const closeBtn = screen.getByLabelText(/dismiss/i);
    fireEvent.click(closeBtn);
    
    expect(screen.queryByText(/Customer alice has arrived for pickup!/i)).not.toBeInTheDocument();
    expect(sessionStorage.getItem('customerArrivedNoticeMuted')).toBe('true');
  });

  it('unmutes notice when a new arrived order is added', async () => {
    let setOrdersMock;
    const TestComponent = () => {
      const [ordersList, setOrdersList] = React.useState([
        { id: 1, status: 'ARRIVED', user: { username: 'alice' } }
      ]);
      setOrdersMock = setOrdersList;
      appState.orders = ordersList;
      return <CustomerArrivedNotice />;
    };

    renderWithProviders(<TestComponent />);
    
    // Mute it
    const closeBtn = screen.getByLabelText(/dismiss/i);
    fireEvent.click(closeBtn);
    expect(sessionStorage.getItem('customerArrivedNoticeMuted')).toBe('true');

    // Add a new arrived order by updating state
    await React.act(async () => {
      setOrdersMock([
        { id: 1, status: 'ARRIVED', user: { username: 'alice' } },
        { id: 2, status: 'ARRIVED', user: { username: 'bob' } }
      ]);
    });

    // Notice should reappear
    expect(await screen.findByText(/2 customers \(alice, bob\) have arrived for pickup!/i)).toBeInTheDocument();
  });
});
