import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ConfirmationModal from './ConfirmationModal';

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  title: 'Delete Item',
  message: 'Are you sure?',
};

describe('ConfirmationModal', () => {
  it('renders nothing when closed', () => {
    render(<ConfirmationModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('Delete Item')).not.toBeInTheDocument();
  });

  it('renders title and message when open', () => {
    render(<ConfirmationModal {...defaultProps} />);
    expect(screen.getByText('Delete Item')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(<ConfirmationModal {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onClose when cancel button is clicked', () => {
    const onClose = vi.fn();
    render(<ConfirmationModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<ConfirmationModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(document.querySelector('.modal-overlay'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose when the modal container itself is clicked', () => {
    const onClose = vi.fn();
    render(<ConfirmationModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(document.querySelector('.modal-container'));
    expect(onClose).not.toHaveBeenCalled();
  });

  describe('isSubmitting=true', () => {
    it('disables the confirm button', () => {
      render(<ConfirmationModal {...defaultProps} isSubmitting />);
      expect(screen.getByRole('button', { name: /processing/i })).toBeDisabled();
    });

    it('shows "Processing..." on the confirm button', () => {
      render(<ConfirmationModal {...defaultProps} confirmText="Delete" isSubmitting />);
      expect(screen.getByRole('button', { name: /processing/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
    });

    it('does not call onClose when backdrop is clicked', () => {
      const onClose = vi.fn();
      render(<ConfirmationModal {...defaultProps} onClose={onClose} isSubmitting />);
      fireEvent.click(document.querySelector('.modal-overlay'));
      expect(onClose).not.toHaveBeenCalled();
    });

    it('does not call onConfirm when confirm button is clicked while disabled', () => {
      const onConfirm = vi.fn();
      render(<ConfirmationModal {...defaultProps} onConfirm={onConfirm} isSubmitting />);
      fireEvent.click(screen.getByRole('button', { name: /processing/i }));
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });
});
