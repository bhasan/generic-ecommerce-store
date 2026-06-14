import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import AuthorizeNetPaymentModal from './AuthorizeNetPaymentModal';

const defaultProps = {
  orderId: 42,
  token: 'tok_abc',
  paymentFormUrl: 'https://test.authorize.net/payment/payment',
  amount: 41.14,
  onSuccess: vi.fn(),
  onFailure: vi.fn(),
  onClose: vi.fn(),
};

function postMessage(data) {
  window.dispatchEvent(new MessageEvent('message', { data, origin: window.location.origin }));
}

describe('AuthorizeNetPaymentModal', () => {
  let submitSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom doesn't implement form submission; spy so the auto-submit doesn't throw
    // and we can assert the token is POSTed.
    submitSpy = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
  });

  it('renders the modal with order total', () => {
    render(<AuthorizeNetPaymentModal {...defaultProps} />);
    expect(screen.getByText(/Complete Payment/i)).toBeInTheDocument();
    expect(screen.getByText(/\$41\.14/i)).toBeInTheDocument();
  });

  it('POSTs the token to the payment form URL, targeting the iframe', () => {
    render(<AuthorizeNetPaymentModal {...defaultProps} />);
    const iframe = document.querySelector('iframe');
    expect(iframe).toBeTruthy();
    const form = document.querySelector('form');
    expect(form).toBeTruthy();
    expect(form.getAttribute('action')).toBe(defaultProps.paymentFormUrl);
    expect(form.getAttribute('method')).toBe('post');
    expect(form.getAttribute('target')).toBe(iframe.getAttribute('name'));
    const tokenInput = form.querySelector('input[name="token"]');
    expect(tokenInput.value).toBe(defaultProps.token);
    expect(submitSpy).toHaveBeenCalled();
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

  it('resizes the iframe to a fractional height, rounded up with a buffer to avoid a sub-pixel scrollbar', () => {
    render(<AuthorizeNetPaymentModal {...defaultProps} />);
    act(() => {
      postMessage('action=resizeWindow&width=600&height=900.141');
    });
    const iframe = document.querySelector('iframe');
    // ceil(900.141) + 4px buffer
    expect(iframe.height).toBe('905');
  });
});
