import React, { useEffect, useRef, useState } from 'react';
import { verifyPayment } from '../../services/ordersApi';

export default function AuthorizeNetPaymentModal({ orderId, iframeUrl, amount, onSuccess, onFailure, onClose }) {
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [iframeHeight, setIframeHeight] = useState(500);
  const onSuccessRef = useRef(onSuccess);
  const onFailureRef = useRef(onFailure);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onFailureRef.current = onFailure;
  });

  useEffect(() => {
    window.AuthorizeNetIFrame = {
      onReceiveCommunication: (querystr) => {
        const params = new URLSearchParams(querystr);
        const action = params.get('action');

        if (action === 'resizeWindow') {
          // Accept Hosted grows past its initial height on validation errors.
          const height = parseInt(params.get('height'), 10);
          if (!Number.isNaN(height)) setIframeHeight(Math.max(height, 400));
          return;
        }

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
      },
    };

    return () => {
      delete window.AuthorizeNetIFrame;
    };
  }, [orderId]);

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
            <iframe
              src={iframeUrl}
              title="Secure Card Payment"
              width="100%"
              height={iframeHeight}
              frameBorder="0"
              scrolling="no"
            />
          )}
        </div>

        <div className="modal-footer">
          <p>🔒 Total: <strong>${amount.toFixed(2)}</strong> — Card details processed by Authorize.Net</p>
        </div>
      </div>
    </div>
  );
}
