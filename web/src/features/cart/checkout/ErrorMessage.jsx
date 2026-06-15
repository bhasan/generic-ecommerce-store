import React from 'react';
import { AlertCircle } from 'lucide-react';

export default function ErrorMessage({ message }) {
  if (!message) return null;
  return (
    <span className="error-message">
      <AlertCircle size={14} />
      {message}
    </span>
  );
}
