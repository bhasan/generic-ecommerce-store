import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import './BaseModal.css';

function BaseModal({
  isOpen,
  onClose,
  children,
  className,
  maxWidth = '500px',
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
}) {
  const containerRef = useRef(null);
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);

  // Keep ref current without adding to effect deps
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement;

    document.body.style.overflow = 'hidden';

    if (containerRef.current) {
      containerRef.current.focus();
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      if (previousFocusRef.current && previousFocusRef.current.focus) {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-container ${className || ''}`}
        style={{ maxWidth }}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        onClick={(e) => e.stopPropagation()}
        ref={containerRef}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, subtitle, icon, onClose, children }) {
  return (
    <div className="modal-header">
      {icon && <div className="modal-icon-wrapper">{icon}</div>}
      <div className="modal-title-group">
        {title && <h2 className="modal-title">{title}</h2>}
        {subtitle && <p className="modal-subtitle">{subtitle}</p>}
        {children}
      </div>
      {onClose && (
        <button className="modal-close-btn" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
      )}
    </div>
  );
}

function ModalFooter({ children, className }) {
  return (
    <div className={`modal-footer ${className || ''}`}>
      {children}
    </div>
  );
}

export default BaseModal;
export { ModalHeader, ModalFooter };
