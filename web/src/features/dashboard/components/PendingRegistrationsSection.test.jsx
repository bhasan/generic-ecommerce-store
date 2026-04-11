import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PendingRegistrationsSection from './PendingRegistrationsSection';

const pendingUser = {
  id: 10,
  username: 'newuser',
  email: 'new@example.com',
  address: '123 Main St',
  cashapp: '$newuser',
  phoneNumber: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const defaultProps = {
  isLoading: false,
  pendingRegistrations: [pendingUser],
  formatDate: (d) => d,
  onApprove: vi.fn(),
  onReject: vi.fn(),
};

describe('PendingRegistrationsSection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a loading state while fetching', () => {
    render(<PendingRegistrationsSection {...defaultProps} isLoading />);
    expect(screen.getByText(/loading pending registrations/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no pending registrations', () => {
    render(<PendingRegistrationsSection {...defaultProps} pendingRegistrations={[]} />);
    expect(screen.getByText(/no pending registrations/i)).toBeInTheDocument();
  });

  it('renders each pending user', () => {
    render(<PendingRegistrationsSection {...defaultProps} />);
    expect(screen.getByText('newuser')).toBeInTheDocument();
    expect(screen.getByText('123 Main St')).toBeInTheDocument();
    expect(screen.getByText('$newuser')).toBeInTheDocument();
  });

  describe('approve flow', () => {
    it('opens the approve confirmation modal when Approve is clicked', async () => {
      render(<PendingRegistrationsSection {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: /approve/i }));
      expect(await screen.findByText(/approve user registration/i)).toBeInTheDocument();
    });

    it('calls onApprove and closes the modal on confirm', async () => {
      const onApprove = vi.fn().mockResolvedValue(undefined);
      render(<PendingRegistrationsSection {...defaultProps} onApprove={onApprove} />);

      fireEvent.click(screen.getByRole('button', { name: /approve/i }));
      await screen.findByText(/approve user registration/i);
      fireEvent.click(screen.getByRole('button', { name: /^approve user$/i }));

      await waitFor(() => expect(onApprove).toHaveBeenCalledWith(pendingUser.id));
      await waitFor(() =>
        expect(screen.queryByText(/approve user registration/i)).not.toBeInTheDocument()
      );
    });

    it('disables the confirm button and blocks backdrop during the approve API call', async () => {
      let resolveApprove;
      const onApprove = vi.fn().mockReturnValue(new Promise((res) => { resolveApprove = res; }));
      render(<PendingRegistrationsSection {...defaultProps} onApprove={onApprove} />);

      fireEvent.click(screen.getByRole('button', { name: /approve/i }));
      await screen.findByText(/approve user registration/i);
      fireEvent.click(screen.getByRole('button', { name: /^approve user$/i }));

      // While in-flight the button should show Processing... and be disabled
      expect(await screen.findByRole('button', { name: /processing/i })).toBeDisabled();

      // Backdrop click should not close the modal while submitting
      fireEvent.click(document.querySelector('.modal-overlay'));
      expect(screen.getByText(/approve user registration/i)).toBeInTheDocument();

      resolveApprove();
      await waitFor(() =>
        expect(screen.queryByText(/approve user registration/i)).not.toBeInTheDocument()
      );
    });

    it('closes the modal even when onApprove throws', async () => {
      const onApprove = vi.fn().mockRejectedValue(new Error('server error'));
      render(<PendingRegistrationsSection {...defaultProps} onApprove={onApprove} />);

      fireEvent.click(screen.getByRole('button', { name: /approve/i }));
      await screen.findByText(/approve user registration/i);
      fireEvent.click(screen.getByRole('button', { name: /^approve user$/i }));

      await waitFor(() =>
        expect(screen.queryByText(/approve user registration/i)).not.toBeInTheDocument()
      );
    });
  });

  describe('reject flow', () => {
    it('opens the reject modal when Reject is clicked', async () => {
      render(<PendingRegistrationsSection {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: /reject/i }));
      expect(await screen.findByText(/reject user registration/i)).toBeInTheDocument();
    });

    it('calls onReject with the note and closes the modal on confirm', async () => {
      const onReject = vi.fn().mockResolvedValue(undefined);
      render(<PendingRegistrationsSection {...defaultProps} onReject={onReject} />);

      fireEvent.click(screen.getByRole('button', { name: /reject/i }));
      await screen.findByText(/reject user registration/i);
      fireEvent.change(screen.getByLabelText(/rejection note/i), { target: { value: 'Not eligible' } });
      fireEvent.click(screen.getByRole('button', { name: /reject user/i }));

      await waitFor(() => expect(onReject).toHaveBeenCalledWith(pendingUser.id, 'Not eligible'));
      await waitFor(() =>
        expect(screen.queryByText(/reject user registration/i)).not.toBeInTheDocument()
      );
    });

    it('disables the Reject User button and blocks backdrop during the reject API call', async () => {
      let resolveReject;
      const onReject = vi.fn().mockReturnValue(new Promise((res) => { resolveReject = res; }));
      render(<PendingRegistrationsSection {...defaultProps} onReject={onReject} />);

      fireEvent.click(screen.getByRole('button', { name: /reject/i }));
      await screen.findByText(/reject user registration/i);
      fireEvent.click(screen.getByRole('button', { name: /reject user/i }));

      // While in-flight the button should show Rejecting... and be disabled
      expect(await screen.findByRole('button', { name: /rejecting/i })).toBeDisabled();

      // Backdrop click should not close the modal while submitting
      fireEvent.click(document.querySelector('.modal-overlay'));
      expect(screen.getByText(/reject user registration/i)).toBeInTheDocument();

      resolveReject();
      await waitFor(() =>
        expect(screen.queryByText(/reject user registration/i)).not.toBeInTheDocument()
      );
    });

    it('closes the modal even when onReject throws', async () => {
      const onReject = vi.fn().mockRejectedValue(new Error('server error'));
      render(<PendingRegistrationsSection {...defaultProps} onReject={onReject} />);

      fireEvent.click(screen.getByRole('button', { name: /reject/i }));
      await screen.findByText(/reject user registration/i);
      fireEvent.click(screen.getByRole('button', { name: /reject user/i }));

      await waitFor(() =>
        expect(screen.queryByText(/reject user registration/i)).not.toBeInTheDocument()
      );
    });
  });
});
