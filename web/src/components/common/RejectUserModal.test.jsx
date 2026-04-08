import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RejectUserModal from './RejectUserModal';

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  userName: 'testuser',
};

describe('RejectUserModal', () => {
  it('renders nothing when closed', () => {
    render(<RejectUserModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('Reject User Registration')).not.toBeInTheDocument();
  });

  it('renders the user name and form when open', () => {
    render(<RejectUserModal {...defaultProps} />);
    expect(screen.getByText('Reject User Registration')).toBeInTheDocument();
    expect(screen.getByText(/testuser/)).toBeInTheDocument();
    expect(screen.getByLabelText(/rejection note/i)).toBeInTheDocument();
  });

  it('calls onConfirm with the rejection note when Reject User is clicked', () => {
    const onConfirm = vi.fn();
    render(<RejectUserModal {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByLabelText(/rejection note/i), { target: { value: 'Not eligible' } });
    fireEvent.click(screen.getByRole('button', { name: /reject user/i }));
    expect(onConfirm).toHaveBeenCalledWith('Not eligible');
  });

  it('calls onConfirm with undefined when note is empty', () => {
    const onConfirm = vi.fn();
    render(<RejectUserModal {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: /reject user/i }));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<RejectUserModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<RejectUserModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(document.querySelector('.modal-overlay'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  describe('isSubmitting=true', () => {
    it('disables the Reject User button', () => {
      render(<RejectUserModal {...defaultProps} isSubmitting />);
      expect(screen.getByRole('button', { name: /rejecting/i })).toBeDisabled();
    });

    it('shows "Rejecting..." on the button', () => {
      render(<RejectUserModal {...defaultProps} isSubmitting />);
      expect(screen.getByRole('button', { name: /rejecting/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^reject user$/i })).not.toBeInTheDocument();
    });

    it('does not call onClose when backdrop is clicked', () => {
      const onClose = vi.fn();
      render(<RejectUserModal {...defaultProps} onClose={onClose} isSubmitting />);
      fireEvent.click(document.querySelector('.modal-overlay'));
      expect(onClose).not.toHaveBeenCalled();
    });

    it('does not call onConfirm when button is clicked while disabled', () => {
      const onConfirm = vi.fn();
      render(<RejectUserModal {...defaultProps} onConfirm={onConfirm} isSubmitting />);
      fireEvent.click(screen.getByRole('button', { name: /rejecting/i }));
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });
});
