import React from 'react';
import './LoadingState.css';

function LoadingState({ message }) {
  return (
    <div className="loading-state">
      <div className="loading-spinner" />
      {message && <p className="loading-message">{message}</p>}
    </div>
  );
}

export default LoadingState;
