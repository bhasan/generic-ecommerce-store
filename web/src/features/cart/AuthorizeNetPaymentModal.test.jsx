import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import AuthorizeNetPaymentModal from './AuthorizeNetPaymentModal';

const defaultProps = {
  orderId: 42,
  iframeUrl: 'https://test.authorize.net/payment/payment?token=abc',
  amount: 41.14,
  onSuccess: vi.fn(),
  onFailure: vi.fn(),
  onClose: vi.fn(),
};

describe('AuthorizeNetPaymentModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete window.AuthorizeNetIFrame;
  });

  it('renders the modal with order total', () => {
    render(<AuthorizeNetPaymentModal {...defaultProps} />);
    expect(screen.getByText(/Complete Payment/i)).toBeInTheDocument();
    expect(screen.getByText(/\$41\.14/i)).toBeInTheDocument();
  });

  it('renders an iframe with the provided iframeUrl', () => {
    render(<AuthorizeNetPaymentModal {...defaultProps} />);
    const iframe = document.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe.src).toBe(defaultProps.iframeUrl);
  });

  it('registers window.AuthorizeNetIFrame on mount and cleans up on unmount', () => {
    const { unmount } = render(<AuthorizeNetPaymentModal {...defaultProps} />);
    expect(window.AuthorizeNetIFrame).toBeDefined();
    unmount();
    expect(window.AuthorizeNetIFrame).toBeUndefined();
  });

  it('calls onClose when the X button is clicked', () => {
    render(<AuthorizeNetPaymentModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onFailure when Authorize.net sends a cancel action', () => {
    render(<AuthorizeNetPaymentModal {...defaultProps} />);
    window.AuthorizeNetIFrame.onReceiveCommunication('action=cancel');
    expect(defaultProps.onFailure).toHaveBeenCalledTimes(1);
  });

  it('calls onFailure when transactResponse has non-1 responseCode', () => {
    render(<AuthorizeNetPaymentModal {...defaultProps} />);
    const response = JSON.stringify({ responseCode: '2', transId: '', responseReasonText: 'Declined' });
    window.AuthorizeNetIFrame.onReceiveCommunication(`action=transactResponse&response=${encodeURIComponent(response)}`);
    expect(defaultProps.onFailure).toHaveBeenCalledWith('Declined');
  });

  it('resizes the iframe when Authorize.net sends a resizeWindow action', () => {
    render(<AuthorizeNetPaymentModal {...defaultProps} />);
    act(() => {
      window.AuthorizeNetIFrame.onReceiveCommunication('action=resizeWindow&width=600&height=900');
    });
    const iframe = document.querySelector('iframe');
    expect(iframe.height).toBe('900');
  });
});
