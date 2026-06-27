import React, { useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { verifyPayment } from '../../services/ordersApi';
import { formatCurrency } from '../../utils/currencyUtils';

const IFRAME_NAME = 'authnet-payment-frame';

export default function AuthorizeNetPaymentModal({ orderId, token, paymentFormUrl, amount, onSuccess, onFailure, onClose }) {
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const onSuccessRef = useRef(onSuccess);
  const onFailureRef = useRef(onFailure);
  const formRef = useRef(null);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onFailureRef.current = onFailure;
  });

  useEffect(() => {
    const handleMessage = (event) => {
      // Only accept messages from our own origin (posted by communicator.html)
      if (event.origin !== window.location.origin) return;

      const querystr = event.data;
      if (typeof querystr !== 'string') return;

      const params = new URLSearchParams(querystr);
      const action = params.get('action');

      // Note: Accept Hosted also emits a `resizeWindow` action. We intentionally
      // ignore it — the iframe fills a fixed-height modal body and scrolls its own
      // content, so there's a single scrollbar (the form's) rather than resizing the
      // iframe element inside a separately-scrolling container (which caused two).

      if (action === 'cancel') {
        onFailureRef.current('Payment cancelled');
        return;
      }

      if (action === 'transactResponse') {
        let response;
        try {
          response = JSON.parse(params.get('response'));
        } catch {
          onFailureRef.current('Invalid payment response');
          return;
        }

        if (response.responseCode !== '1') {
          onFailureRef.current(response.responseReasonText || 'Payment declined');
          return;
        }

        setVerifying(true);
        setVerifyError('');
        verifyPayment(orderId, response.transId)
          .then(() => onSuccessRef.current())
          .catch(() => {
            setVerifying(false);
            setVerifyError(
              `Payment may have gone through — contact support with order #${orderId} if your card was charged.`
            );
          });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [orderId]);

  // Accept Hosted requires the token to be POSTed (not a GET query param).
  // Auto-submit the hidden form into the named iframe once it's mounted.
  useEffect(() => {
    if (!verifying && !verifyError && formRef.current) {
      formRef.current.submit();
    }
  }, [token, verifying, verifyError]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="send-payment-modal">
        <div className="modal-header">
          <h3>Complete Payment · Order #{orderId}</h3>
          <button
            className="modal-close-btn"
            onClick={onClose}
            aria-label="close"
            disabled={verifying}
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          {verifying ? (
            <div className="modal-verifying">
              <div className="spinner" />
              <p>Confirming your payment…</p>
            </div>
          ) : verifyError ? (
            <div className="modal-verify-error">
              <p>{verifyError}</p>
            </div>
          ) : (
            <>
              <form
                ref={formRef}
                action={paymentFormUrl}
                method="post"
                target={IFRAME_NAME}
                style={{ display: 'none' }}
              >
                <input type="hidden" name="token" value={token} />
              </form>
              <iframe
                name={IFRAME_NAME}
                title="Secure Card Payment"
                width="100%"
                height="100%"
                style={{ border: 'none' }}
              />
            </>
          )}
        </div>

        <div className="modal-footer">
          <p><Lock size={14} /> Total: <strong>${formatCurrency(amount)}</strong> — Card details processed by Authorize.Net</p>
        </div>
      </div>
    </div>
  );
}
