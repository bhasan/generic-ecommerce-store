import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MessagesSection from './MessagesSection';

const baseProps = {
  isLoading: false,
  messages: [
    {
      id: 1,
      status: 'NEW',
      subject: 'Order Issue',
      createdAt: '2026-04-01T10:00:00.000Z',
      userName: 'customer-one',
      userEmail: 'customer@example.com',
      userPhone: '555-0100',
      orderId: 77,
      message: 'Need help with my order',
      adminNotes: '',
      repliedAt: null,
      replyMessage: null,
    },
  ],
  formatDate: () => 'Apr 1, 2026',
  statusFilter: '',
  onStatusFilterChange: vi.fn(),
  onMarkAsRead: vi.fn(),
  onMarkAsResolved: vi.fn(),
  onDelete: vi.fn(),
  onReply: vi.fn(),
  isReplying: false,
  currentUserId: 1,
  isAdmin: true,
};

describe('MessagesSection integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty-state copy for filtered empty message lists', () => {
    render(
      <MessagesSection
        {...baseProps}
        messages={[]}
        statusFilter="RESOLVED"
      />
    );

    expect(screen.getByText('No resolved messages found.')).toBeInTheDocument();
  });

  it('lets staff expand a message and trigger read/resolve actions', () => {
    render(<MessagesSection {...baseProps} />);

    fireEvent.click(screen.getByText('Order Issue'));
    fireEvent.click(screen.getByRole('button', { name: /mark as read/i }));
    fireEvent.click(screen.getByRole('button', { name: /mark resolved/i }));

    expect(baseProps.onMarkAsRead).toHaveBeenCalledWith(1);
    expect(baseProps.onMarkAsResolved).toHaveBeenCalledWith(1);
  });

  it('submits email replies once the minimum reply length is met', async () => {
    const onReply = vi.fn().mockResolvedValue(true);

    render(<MessagesSection {...baseProps} onReply={onReply} />);

    fireEvent.click(screen.getByText('Order Issue'));
    fireEvent.click(screen.getByRole('button', { name: /reply via email/i }));
    fireEvent.change(screen.getByLabelText(/reply to customer-one/i), {
      target: { value: 'Thanks, we have updated your order.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send email reply/i }));

    await waitFor(() => expect(onReply).toHaveBeenCalledWith(1, 'Thanks, we have updated your order.'));
  });
});
