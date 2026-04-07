import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
const landingPageSettingsApi = vi.hoisted(() => ({
  getLandingPageSettings: vi.fn(),
  updateLandingPageSettings: vi.fn(),
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
vi.mock('../../services/landingPageSettingsApi', () => landingPageSettingsApi);

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
  default: ({ messages, onReply }) => (
    <div>
      <div>Messages: {messages.length}</div>
      <button onClick={() => onReply?.(42, 'Reply body')}>Reply to Message</button>
    </div>
  ),
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

vi.mock('./components/LandingPageSection', () => ({
  default: ({ landingPageSettings, onSave }) => (
    <div>
      <div>Landing Page Section</div>
      <div data-testid="featured-ids">{JSON.stringify(landingPageSettings?.featuredProductIds || [])}</div>
      <button onClick={() => onSave({ featuredProductIds: [1, 2, 3] })}>
        Save Landing Page
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
    vi.useRealTimers();
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
    landingPageSettingsApi.getLandingPageSettings.mockResolvedValue({ featuredProductIds: [5, 7] });
    landingPageSettingsApi.updateLandingPageSettings.mockResolvedValue({});
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

  it('registers a polling refresh while the messages section is active', async () => {
    const intervalSpy = vi.spyOn(global, 'setInterval');

    renderDashboard('/dashboard?section=messages');

    await waitFor(() => expect(contactMessagesApi.getAllMessages).toHaveBeenCalledTimes(1));
    expect(intervalSpy).toHaveBeenCalled();

    const refreshCall = intervalSpy.mock.calls.find(([, delay]) => delay === 50000);
    expect(refreshCall).toBeTruthy();

    const refreshFn = refreshCall?.[0];
    expect(typeof refreshFn).toBe('function');

    await act(async () => {
      await refreshFn?.();
    });

    expect(contactMessagesApi.getAllMessages).toHaveBeenCalledTimes(2);

    intervalSpy.mockRestore();
  });

  it('loads landing page settings when the landing-page section is selected', async () => {
    renderDashboard('/dashboard?section=landing-page');

    await waitFor(() => expect(screen.getByTestId('featured-ids')).toHaveTextContent('[5,7]'));
    expect(landingPageSettingsApi.getLandingPageSettings).toHaveBeenCalled();
    expect(screen.getByText('Landing Page Section')).toBeInTheDocument();
  });

  it('saves landing page settings, shows a success notification, and refreshes shared config', async () => {
    renderDashboard('/dashboard?section=landing-page');

    await waitFor(() => expect(landingPageSettingsApi.getLandingPageSettings).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /save landing page/i }));

    await waitFor(() => expect(landingPageSettingsApi.updateLandingPageSettings).toHaveBeenCalledWith({
      featuredProductIds: [1, 2, 3],
    }));
    expect(baseAppState.showNotification).toHaveBeenCalledWith('Landing page settings updated successfully', 'success');
    expect(baseAppState.loadConfig).toHaveBeenCalled();
  });

  it('shows a warning when reply persistence succeeds but email delivery fails', async () => {
    contactMessagesApi.replyToMessage.mockResolvedValue({
      success: true,
      emailDelivered: false,
      message: 'Reply recorded, but email delivery failed.',
    });

    renderDashboard('/dashboard?section=messages');

    await waitFor(() => expect(contactMessagesApi.getAllMessages).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /reply to message/i }));

    await waitFor(() => expect(contactMessagesApi.replyToMessage).toHaveBeenCalledWith(42, 'Reply body'));
    expect(baseAppState.showNotification).toHaveBeenCalledWith(
      'Reply recorded, but email delivery failed.',
      'warning'
    );
  });
});
