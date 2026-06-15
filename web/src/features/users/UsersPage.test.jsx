import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import UsersPage from './UsersPage';
import { ROLES } from '../../utils/roles';

vi.mock('../../components/layout/AdminLayout', () => ({
  default: ({ children }) => <div data-testid="admin-layout">{children}</div>,
}));

vi.mock('../../components/common/HeaderDivider', () => ({
  default: () => <div data-testid="header-divider" />,
}));

vi.mock('../../components/common/ConfirmationModal', () => ({
  default: ({ isOpen, onConfirm, onClose, title }) =>
    isOpen ? (
      <div data-testid="confirmation-modal">
        <span>{title}</span>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    ) : null,
}));

const useAppMock = vi.hoisted(() => vi.fn());
vi.mock('../../context/AppContext', () => ({
  useApp: () => useAppMock(),
}));

const usersApi = vi.hoisted(() => ({
  getAllUsers: vi.fn(),
  getAllRoles: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
}));
vi.mock('../../services/usersApi', () => usersApi);

const makeAppState = (overrides = {}) => ({
  currentUser: { id: 1, username: 'admin', roles: [ROLES.ADMIN] },
  showNotification: vi.fn(),
  ...overrides,
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <UsersPage />
    </MemoryRouter>
  );

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppMock.mockReturnValue(makeAppState());
    usersApi.getAllRoles.mockResolvedValue([ROLES.ADMIN, ROLES.MANAGEMENT, ROLES.CUSTOMER]);
  });

  it('renders loading state inside AdminLayout before data arrives', () => {
    usersApi.getAllUsers.mockReturnValue(new Promise(() => {})); // never resolves

    renderPage();

    expect(screen.getByTestId('admin-layout')).toBeInTheDocument();
    expect(screen.getByText('Loading users...')).toBeInTheDocument();
  });

  it('renders users table inside AdminLayout after data loads', async () => {
    usersApi.getAllUsers.mockResolvedValue([
      { id: 2, username: 'customer-one', email: 'c1@test.com', roles: [ROLES.CUSTOMER], createdAt: '2024-01-01T00:00:00.000Z' },
      { id: 3, username: 'manager-one', email: 'm1@test.com', roles: [ROLES.MANAGEMENT], createdAt: '2024-02-01T00:00:00.000Z' },
    ]);

    renderPage();

    await waitFor(() => expect(screen.getByText('customer-one')).toBeInTheDocument());

    expect(screen.getByTestId('admin-layout')).toBeInTheDocument();
    expect(screen.getByText('manager-one')).toBeInTheDocument();
    expect(screen.getByText('Manage all system users')).toBeInTheDocument();
  });

  it('shows "You" badge on the current user row and hides the delete button for it', async () => {
    usersApi.getAllUsers.mockResolvedValue([
      { id: 1, username: 'admin', email: 'admin@test.com', roles: [ROLES.ADMIN], createdAt: '2024-01-01T00:00:00.000Z' },
      { id: 5, username: 'other', email: 'other@test.com', roles: [ROLES.CUSTOMER], createdAt: '2024-01-01T00:00:00.000Z' },
    ]);

    renderPage();

    await waitFor(() => expect(screen.getByText('admin')).toBeInTheDocument());

    expect(screen.getByText('You')).toBeInTheDocument();
    // Only one delete button visible — for the other user, not the current user
    expect(screen.getAllByTitle('Delete user')).toHaveLength(1);
  });

  it('shows an error message and calls showNotification when getAllUsers rejects', async () => {
    const showNotification = vi.fn();
    useAppMock.mockReturnValue(makeAppState({ showNotification }));
    usersApi.getAllUsers.mockRejectedValue(new Error('Network error'));

    renderPage();

    await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument());
    expect(showNotification).toHaveBeenCalledWith('Network error', 'error');
  });

  it('opens delete confirmation modal when delete button is clicked', async () => {
    usersApi.getAllUsers.mockResolvedValue([
      { id: 7, username: 'to-delete', email: 'del@test.com', roles: [ROLES.CUSTOMER], createdAt: '2024-01-01T00:00:00.000Z' },
    ]);

    renderPage();

    await waitFor(() => expect(screen.getByTitle('Delete user')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Delete user'));

    expect(screen.getByTestId('confirmation-modal')).toBeInTheDocument();
    expect(screen.getByText('Delete User')).toBeInTheDocument();
  });
});
