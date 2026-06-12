import { describe, it, expect, vi, beforeEach } from 'vitest';
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

function postMessage(data) {
  window.dispatchEvent(new MessageEvent('message', { data, origin: window.location.origin }));
}

describe('AuthorizeNetPaymentModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('cleans up the message listener on unmount', () => {
    const spy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<AuthorizeNetPaymentModal {...defaultProps} />);
    unmount();
    expect(spy).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('calls onClose when the X button is clicked', () => {
    render(<AuthorizeNetPaymentModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores messages from foreign origins', () => {
    render(<AuthorizeNetPaymentModal {...defaultProps} />);
    window.dispatchEvent(new MessageEvent('message', { data: 'action=cancel', origin: 'https://evil.example.com' }));
    expect(defaultProps.onFailure).not.toHaveBeenCalled();
  });

  it('calls onFailure when Authorize.net sends a cancel action', () => {
    render(<AuthorizeNetPaymentModal {...defaultProps} />);
    postMessage('action=cancel');
    expect(defaultProps.onFailure).toHaveBeenCalledTimes(1);
  });

  it('calls onFailure when transactResponse has non-1 responseCode', () => {
    render(<AuthorizeNetPaymentModal {...defaultProps} />);
    const response = JSON.stringify({ responseCode: '2', transId: '', responseReasonText: 'Declined' });
    postMessage(`action=transactResponse&response=${encodeURIComponent(response)}`);
    expect(defaultProps.onFailure).toHaveBeenCalledWith('Declined');
  });

  it('resizes the iframe when Authorize.net sends a resizeWindow action', () => {
    render(<AuthorizeNetPaymentModal {...defaultProps} />);
    act(() => {
      postMessage('action=resizeWindow&width=600&height=900');
    });
    const iframe = document.querySelector('iframe');
    expect(iframe.height).toBe('900');
  });
});
