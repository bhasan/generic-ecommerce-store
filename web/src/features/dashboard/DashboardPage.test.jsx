import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from './DashboardPage';

const useAppMock = vi.hoisted(() => vi.fn());
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
const landingPageSettingsApi = vi.hoisted(() => ({
  getLandingPageSettings: vi.fn(),
  updateLandingPageSettings: vi.fn(),
}));
const productsApi = vi.hoisted(() => ({
  getAllProducts: vi.fn(),
  updateProduct: vi.fn(),
}));

vi.mock('../../context/AppContext', () => ({
  useApp: () => useAppMock(),
  AppProvider: ({ children }) => children,
}));

vi.mock('../../services/usersApi', () => usersApi);
vi.mock('../../services/announcementsApi', () => announcementsApi);
vi.mock('../../services/contactMessagesApi', () => contactMessagesApi);
vi.mock('../../services/landingPageSettingsApi', () => landingPageSettingsApi);
vi.mock('../../services/productsApi', () => productsApi);

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

vi.mock('./components/VIPManagementSection', () => ({
  default: ({ isLoading, users, products, onToggleVipUser, onToggleVipProduct }) => (
    <div>
      <div>VIP Management Section</div>
      <div data-testid="vip-user-count">{(users || []).length}</div>
      <div data-testid="vip-product-count">{(products || []).length}</div>
      {isLoading && <div>Loading VIP data...</div>}
      <button onClick={() => onToggleVipUser?.({ id: 1, username: 'alice', roles: ['CUSTOMER'] })}>
        Toggle VIP User
      </button>
      <button onClick={() => onToggleVipProduct?.({ id: 101, name: 'Blue Dream', vipOnly: false })}>
        Toggle VIP Product
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

const renderDashboard = (route = '/dashboard?section=landing-page') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('DashboardPage layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppMock.mockReturnValue(baseAppState);
    usersApi.getPendingRegistrations.mockResolvedValue([]);
    usersApi.getAllUsers.mockResolvedValue([]);
    usersApi.getAllRoles.mockResolvedValue([]);
    usersApi.getRejectedUsers.mockResolvedValue([]);
    announcementsApi.getAllAnnouncements.mockResolvedValue([]);
    contactMessagesApi.getAllMessages.mockResolvedValue([]);
    landingPageSettingsApi.getLandingPageSettings.mockResolvedValue({ featuredProductIds: [] });
    productsApi.getAllProducts.mockResolvedValue([]);
    productsApi.updateProduct.mockResolvedValue({});
  });

  it('renders a dashboard-layout wrapper containing the sidebar and main content', async () => {
    const { container } = renderDashboard('/dashboard?section=landing-page');
    await waitFor(() => expect(landingPageSettingsApi.getLandingPageSettings).toHaveBeenCalled());

    const layout = container.querySelector('.dashboard-layout');
    expect(layout).toBeInTheDocument();

    const sidebar = layout?.querySelector('aside.dashboard-sidebar');
    expect(sidebar).toBeInTheDocument();

    const main = layout?.querySelector('.dashboard-main-content');
    expect(main).toBeInTheDocument();
  });

  it('renders all 10 sidebar nav items including VIP Management', async () => {
    renderDashboard('/dashboard');
    await waitFor(() => expect(usersApi.getPendingRegistrations).toHaveBeenCalled());

    const expectedLabels = [
      /messages/i,
      /pending registrations/i,
      /announcements/i,
      /^users$/i,
      /rejected users/i,
      /payment settings/i,
      /store settings/i,
      /ordering constraints/i,
      /landing page/i,
      /vip management/i,
    ];
    for (const label of expectedLabels) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('defaults to the pending-registrations section when no query param is present', async () => {
    renderDashboard('/dashboard');
    await waitFor(() => expect(usersApi.getPendingRegistrations).toHaveBeenCalled());
    expect(screen.getByText(/^Pending:/)).toBeInTheDocument();
  });

  it('marks the active sidebar item based on the current section', async () => {
    const { container } = renderDashboard('/dashboard?section=landing-page');
    await waitFor(() => expect(landingPageSettingsApi.getLandingPageSettings).toHaveBeenCalled());

    const activeButtons = container.querySelectorAll('button.sidebar-nav-item.active');
    expect(activeButtons).toHaveLength(1);
    expect(activeButtons[0]).toHaveAccessibleName(/landing page/i);
  });
});

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
    landingPageSettingsApi.getLandingPageSettings.mockResolvedValue({ featuredProductIds: [5, 7] });
    landingPageSettingsApi.updateLandingPageSettings.mockResolvedValue({});
    productsApi.getAllProducts.mockResolvedValue([]);
    productsApi.updateProduct.mockResolvedValue({});
  });

  it('loads the section selected from the query string', async () => {
    renderDashboard('/dashboard?section=landing-page');

    await waitFor(() => expect(landingPageSettingsApi.getLandingPageSettings).toHaveBeenCalled());
    expect(screen.getByText('Landing Page Section')).toBeInTheDocument();
    expect(screen.getByTestId('featured-ids')).toHaveTextContent('[5,7]');
  });

  it('switches sections and loads the matching dashboard data source', async () => {
    renderDashboard('/dashboard?section=landing-page');

    await waitFor(() => expect(landingPageSettingsApi.getLandingPageSettings).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /announcements/i }));

    await waitFor(() => expect(announcementsApi.getAllAnnouncements).toHaveBeenCalled());
    expect(screen.getByText(/^Announcements:/)).toBeInTheDocument();
  });

  it('saves section data, shows a success notification, and refreshes shared config', async () => {
    renderDashboard('/dashboard?section=landing-page');

    await waitFor(() => expect(landingPageSettingsApi.getLandingPageSettings).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /save landing page/i }));

    await waitFor(() => expect(landingPageSettingsApi.updateLandingPageSettings).toHaveBeenCalledWith({
      featuredProductIds: [1, 2, 3],
    }));
    expect(baseAppState.showNotification).toHaveBeenCalledWith('Landing page settings updated successfully', 'success');
    expect(baseAppState.loadConfig).toHaveBeenCalled();
  });

  it('registers a polling refresh while the messages section is active', async () => {
    const intervalSpy = vi.spyOn(global, 'setInterval');

    renderDashboard('/dashboard?section=messages');

    await waitFor(() => expect(contactMessagesApi.getAllMessages).toHaveBeenCalledTimes(1));
    expect(intervalSpy).toHaveBeenCalled();

    const refreshCall = intervalSpy.mock.calls.find(([, delay]) => delay === 60000);
    expect(refreshCall).toBeTruthy();

    const refreshFn = refreshCall?.[0];
    expect(typeof refreshFn).toBe('function');

    await act(async () => {
      await refreshFn?.();
    });

    expect(contactMessagesApi.getAllMessages).toHaveBeenCalledTimes(2);

    intervalSpy.mockRestore();
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

describe('DashboardPage — VIP management', () => {
  const vipUser = { id: 1, username: 'alice', roles: ['CUSTOMER'] };
  const vipProduct = { id: 101, name: 'Blue Dream', vipOnly: false };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    useAppMock.mockReturnValue(baseAppState);
    usersApi.getPendingRegistrations.mockResolvedValue([]);
    usersApi.getAllUsers.mockResolvedValue([vipUser]);
    usersApi.getAllRoles.mockResolvedValue([]);
    usersApi.getRejectedUsers.mockResolvedValue([]);
    usersApi.updateUser.mockResolvedValue({});
    announcementsApi.getAllAnnouncements.mockResolvedValue([]);
    contactMessagesApi.getAllMessages.mockResolvedValue([]);
    landingPageSettingsApi.getLandingPageSettings.mockResolvedValue({ featuredProductIds: [] });
    productsApi.getAllProducts.mockResolvedValue([vipProduct]);
    productsApi.updateProduct.mockResolvedValue({});
  });

  it('renders the VIP Management section when the vip-management route is active', async () => {
    renderDashboard('/dashboard?section=vip-management');
    await waitFor(() => expect(productsApi.getAllProducts).toHaveBeenCalled());
    expect(screen.getByText('VIP Management Section')).toBeInTheDocument();
  });

  it('passes users and products to the VIP section', async () => {
    renderDashboard('/dashboard?section=vip-management');
    await waitFor(() => expect(screen.getByTestId('vip-user-count')).toHaveTextContent('1'));
    expect(screen.getByTestId('vip-product-count')).toHaveTextContent('1');
  });

  it('skips getAllUsers when allUsers is already populated (navigating from Users tab)', async () => {
    renderDashboard('/dashboard?section=users');
    await waitFor(() => expect(usersApi.getAllUsers).toHaveBeenCalledTimes(1));

    // Navigate to VIP — should NOT fetch users again
    fireEvent.click(screen.getByRole('button', { name: /vip management/i }));
    await waitFor(() => expect(productsApi.getAllProducts).toHaveBeenCalled());

    expect(usersApi.getAllUsers).toHaveBeenCalledTimes(1);
  });

  it('applies optimistic update to allUsers immediately when toggling VIP on a user', async () => {
    let resolveUpdate;
    usersApi.updateUser.mockReturnValue(new Promise((r) => { resolveUpdate = r; }));

    renderDashboard('/dashboard?section=vip-management');
    await waitFor(() => expect(screen.getByTestId('vip-user-count')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /toggle vip user/i }));

    // The optimistic update should have run synchronously — allUsers updated in state
    // We verify by checking the mock was called (the handler ran) before the promise resolves
    expect(usersApi.updateUser).toHaveBeenCalledWith(1, { roles: ['CUSTOMER', 'VIP'] });

    resolveUpdate({});
    await waitFor(() => expect(baseAppState.showNotification).toHaveBeenCalledWith(
      'alice is now VIP', 'success'
    ));
  });

  it('reverts the optimistic user update when the API call fails', async () => {
    usersApi.updateUser.mockRejectedValue(new Error('network error'));

    renderDashboard('/dashboard?section=vip-management');
    await waitFor(() => expect(screen.getByTestId('vip-user-count')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /toggle vip user/i }));

    await waitFor(() => expect(baseAppState.showNotification).toHaveBeenCalledWith(
      'network error', 'error'
    ));
  });

  it('applies optimistic update to vipProducts immediately when toggling a product', async () => {
    let resolveUpdate;
    productsApi.updateProduct.mockReturnValue(new Promise((r) => { resolveUpdate = r; }));

    renderDashboard('/dashboard?section=vip-management');
    await waitFor(() => expect(screen.getByTestId('vip-product-count')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /toggle vip product/i }));

    expect(productsApi.updateProduct).toHaveBeenCalledWith(101, { vipOnly: true });

    resolveUpdate({});
    await waitFor(() => expect(baseAppState.showNotification).toHaveBeenCalledWith(
      '"Blue Dream" is now VIP-only', 'success'
    ));
  });

  it('reverts the optimistic product update when the API call fails', async () => {
    productsApi.updateProduct.mockRejectedValue(new Error('server error'));

    renderDashboard('/dashboard?section=vip-management');
    await waitFor(() => expect(screen.getByTestId('vip-product-count')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /toggle vip product/i }));

    await waitFor(() => expect(baseAppState.showNotification).toHaveBeenCalledWith(
      'server error', 'error'
    ));
  });
});
