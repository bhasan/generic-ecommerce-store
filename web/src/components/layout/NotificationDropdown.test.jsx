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
});
