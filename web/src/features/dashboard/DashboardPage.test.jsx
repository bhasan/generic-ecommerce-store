import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from './DashboardPage';

const useAppMock = vi.fn();
const usersApi = vi.hoisted(() => ({
  getPendingRegistrations: vi.fn(),
  getAllUsers: vi.fn(),
  getAllRoles: vi.fn(),
  getRejectedUsers: vi.fn(),
  approveUser: vi.fn(),
  rejectUser: vi.fn(),
  unRejectUser: vi.fn(),
  deleteUser: vi.fn(),
  updateUser: vi.fn(),
}));
const announcementsApi = vi.hoisted(() => ({
  getAllAnnouncements: vi.fn(),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
}));
const contactMessagesApi = vi.hoisted(() => ({
  getAllMessages: vi.fn(),
  markAsRead: vi.fn(),
  markAsResolved: vi.fn(),
  deleteMessage: vi.fn(),
  replyToMessage: vi.fn(),
}));
const paymentSettingsApi = vi.hoisted(() => ({
  getPaymentSettings: vi.fn(),
  updatePaymentSettings: vi.fn(),
}));
const storeSettingsApi = vi.hoisted(() => ({
  getStoreSettings: vi.fn(),
  updateStoreSettings: vi.fn(),
}));
const orderingConstraintsApi = vi.hoisted(() => ({
  getOrderingConstraints: vi.fn(),
  updateOrderingConstraints: vi.fn(),
}));

vi.mock('../../context/AppContext', () => ({
  useApp: () => useAppMock(),
}));

vi.mock('../../services/usersApi', () => usersApi);
vi.mock('../../services/announcementsApi', () => announcementsApi);
vi.mock('../../services/contactMessagesApi', () => contactMessagesApi);
vi.mock('../../services/paymentSettingsApi', () => paymentSettingsApi);
vi.mock('../../services/storeSettingsApi', () => storeSettingsApi);
vi.mock('../../services/orderingConstraintsApi', () => orderingConstraintsApi);

vi.mock('../../components/layout/AdminLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

vi.mock('./components/DashboardHeader', () => ({
  default: () => <div>Dashboard Header</div>,
}));

vi.mock('../../components/common/AnnouncementModal', () => ({
  default: () => null,
}));

vi.mock('../../components/common/ConfirmationModal', () => ({
  default: () => null,
}));

vi.mock('./components/PendingRegistrationsSection', () => ({
  default: ({ pendingRegistrations }) => <div>Pending: {pendingRegistrations.length}</div>,
}));

vi.mock('./components/UsersSection', () => ({
  default: ({ users }) => <div>Users: {users.length}</div>,
}));

vi.mock('./components/AnnouncementsSection', () => ({
  default: ({ announcements }) => <div>Announcements: {announcements.length}</div>,
}));

vi.mock('./components/RejectedUsersSection', () => ({
  default: ({ rejectedUsers }) => <div>Rejected: {rejectedUsers.length}</div>,
}));

vi.mock('./components/MessagesSection', () => ({
  default: ({ messages }) => <div>Messages: {messages.length}</div>,
}));

vi.mock('./components/PaymentSettingsSection', () => ({
  default: ({ paymentSettings, onSave }) => (
    <div>
      <div>Payment Settings Section</div>
      <div data-testid="payment-handle">{paymentSettings?.cashapp?.handle || ''}</div>
      <button onClick={() => onSave({ cashapp: { enabled: true, handle: '$Updated' }, zelle: { enabled: false, handle: '' }, venmo: { enabled: false, handle: '' } })}>
        Save Payment Settings
      </button>
    </div>
  ),
}));

vi.mock('./components/StoreSettingsSection', () => ({
  default: ({ storeSettings, onSave }) => (
    <div>
      <div>Store Settings Section</div>
      <div data-testid="store-name">{storeSettings?.name || ''}</div>
      <button onClick={() => onSave({ name: 'Updated Store', address: '202 New Ave', phoneNumber: '555-0200' })}>
        Save Store Settings
      </button>
    </div>
  ),
}));

vi.mock('./components/OrderingConstraintsSection', () => ({
  default: ({ orderingConstraints, onSave }) => (
    <div>
      <div>Ordering Constraints Section</div>
      <div data-testid="minimum-order">{orderingConstraints?.minimumDeliveryOrder ?? ''}</div>
      <button onClick={() => onSave({ minimumDeliveryOrder: 40, minimumDeliveryOrderEnabled: true })}>
        Save Ordering Constraints
      </button>
    </div>
  ),
}));

const baseAppState = {
  showNotification: vi.fn(),
  currentUser: { id: 1, username: 'admin-one', roles: ['ADMIN'] },
  loadConfig: vi.fn(),
};

const renderDashboard = (route = '/dashboard?section=payment-settings') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('DashboardPage orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppMock.mockReturnValue(baseAppState);
    usersApi.getPendingRegistrations.mockResolvedValue([]);
    usersApi.getAllUsers.mockResolvedValue([]);
    usersApi.getAllRoles.mockResolvedValue(['CUSTOMER', 'ADMIN']);
    usersApi.getRejectedUsers.mockResolvedValue([]);
    announcementsApi.getAllAnnouncements.mockResolvedValue([]);
    contactMessagesApi.getAllMessages.mockResolvedValue([]);
    paymentSettingsApi.getPaymentSettings.mockResolvedValue({
      cashapp: { enabled: true, handle: '$SmokeStationHQ' },
      zelle: { enabled: false, handle: '' },
      venmo: { enabled: false, handle: '' },
    });
    storeSettingsApi.getStoreSettings.mockResolvedValue({
      name: 'Smoke Station',
      address: '101 Example Ave',
      phoneNumber: '555-0100',
    });
    orderingConstraintsApi.getOrderingConstraints.mockResolvedValue({
      minimumDeliveryOrder: 35,
      minimumDeliveryOrderEnabled: true,
    });
    paymentSettingsApi.updatePaymentSettings.mockResolvedValue({});
    storeSettingsApi.updateStoreSettings.mockResolvedValue({});
    orderingConstraintsApi.updateOrderingConstraints.mockResolvedValue({});
  });

  it('loads the section selected from the query string', async () => {
    renderDashboard('/dashboard?section=payment-settings');

    await waitFor(() => expect(paymentSettingsApi.getPaymentSettings).toHaveBeenCalled());
    expect(screen.getByText('Payment Settings Section')).toBeInTheDocument();
    expect(screen.getByTestId('payment-handle')).toHaveTextContent('$SmokeStationHQ');
  });

  it('switches sections and loads the matching dashboard data source', async () => {
    renderDashboard('/dashboard?section=payment-settings');

    await waitFor(() => expect(paymentSettingsApi.getPaymentSettings).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /store settings/i }));

    await waitFor(() => expect(storeSettingsApi.getStoreSettings).toHaveBeenCalled());
    expect(screen.getByText('Store Settings Section')).toBeInTheDocument();
    expect(screen.getByTestId('store-name')).toHaveTextContent('Smoke Station');
  });

  it('saves section data, shows a success notification, and refreshes shared config', async () => {
    renderDashboard('/dashboard?section=ordering-constraints');

    await waitFor(() => expect(orderingConstraintsApi.getOrderingConstraints).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /save ordering constraints/i }));

    await waitFor(() => expect(orderingConstraintsApi.updateOrderingConstraints).toHaveBeenCalledWith({
      minimumDeliveryOrder: 40,
      minimumDeliveryOrderEnabled: true,
    }));
    expect(baseAppState.showNotification).toHaveBeenCalledWith('Ordering constraints updated successfully', 'success');
    expect(baseAppState.loadConfig).toHaveBeenCalled();
  });
});
