import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NotificationDropdown from './NotificationDropdown';

const navigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

describe('NotificationDropdown', () => {
  it('renders unread notifications and marks them read before navigating', async () => {
    const onMarkRead = vi.fn().mockResolvedValue({ updated: true });
    const onMarkAllRead = vi.fn();
    const onToggleMuted = vi.fn();

    render(
      <NotificationDropdown
        counts={{ ordersByStatus: { PENDING: 2 }, pendingRegistrations: 1 }}
        canAccessDashboard
        notifications={[
          {
            id: 5,
            title: 'New order submitted',
            message: 'Order #5 is waiting for review.',
            requiresAttention: true,
            readAt: null,
            metadata: { path: '/orders?status=PENDING' },
          },
        ]}
        unreadCount={1}
        onMarkRead={onMarkRead}
        onMarkAllRead={onMarkAllRead}
        notificationsMuted={false}
        onToggleMuted={onToggleMuted}
        canManageOrders
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    const queueLabel = screen.getByText('Operational Queue');
    const inboxTitle = screen.getByText('New order submitted');
    expect(queueLabel).toBeInTheDocument();
    expect(
      queueLabel.compareDocumentPosition(inboxTitle) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByText('Pending Registrations')).toBeInTheDocument();
    expect(screen.getByText('Mark all read')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Mark all read'));
    expect(onMarkAllRead).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Toggle staff sound alerts'));
    expect(onToggleMuted).toHaveBeenCalled();
    await fireEvent.click(screen.getByText('New order submitted'));

    expect(onMarkRead).toHaveBeenCalledWith(5);
    expect(navigate).toHaveBeenCalledWith('/orders?status=PENDING');
  });

  it('hides the operational queue for non-staff users even if counts are present', () => {
    render(
      <NotificationDropdown
        counts={{ ordersByStatus: { PENDING: 2 }, pendingRegistrations: 1 }}
        canAccessDashboard={false}
        notifications={[
          {
            id: 9,
            title: 'Order #3 updated',
            message: 'Your order is now approved.',
            requiresAttention: false,
            readAt: null,
            metadata: { path: '/orders' },
          },
        ]}
        unreadCount={1}
        onMarkRead={vi.fn()}
        onMarkAllRead={vi.fn()}
        notificationsMuted={false}
        onToggleMuted={vi.fn()}
        canManageOrders={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(screen.queryByText('Operational Queue')).not.toBeInTheDocument();
    expect(screen.getByText('Order #3 updated')).toBeInTheDocument();
  });

  it('renders the "Ready for Pickup" section at the top when orders are waiting', () => {
    const orders = [
      { id: 101, status: 'READY_FOR_PICKUP' },
      { id: 102, status: 'READY_FOR_PICKUP' },
    ];

    render(
      <NotificationDropdown
        counts={{}}
        canAccessDashboard={false}
        notifications={[]}
        unreadCount={0}
        onMarkRead={vi.fn()}
        onMarkAllRead={vi.fn()}
        notificationsMuted={false}
        onToggleMuted={vi.fn()}
        canManageOrders={false}
        orders={orders}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));

    expect(screen.getByText('Action Required')).toBeInTheDocument();
    expect(screen.getByText('Order Ready for Pickup!')).toBeInTheDocument();
    expect(screen.getByText(/You have 2 orders waiting for you at the store/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Order Ready for Pickup!'));
    expect(navigate).toHaveBeenCalledWith('/orders');
  });

  it('calls onOpen only when the dropdown transitions to open', () => {
    const onOpen = vi.fn();

    render(
      <NotificationDropdown
        counts={{ ordersByStatus: {}, pendingRegistrations: 0 }}
        canAccessDashboard={false}
        notifications={[]}
        unreadCount={0}
        onMarkRead={vi.fn()}
        onMarkAllRead={vi.fn()}
        onOpen={onOpen}
        notificationsMuted={false}
        onToggleMuted={vi.fn()}
        canManageOrders={false}
        orders={[]}
      />
    );

    const button = screen.getByLabelText('Notifications');
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);

    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);

    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
