import React, { useState } from 'react';
import './SpaceTravelerGraphic.css';

export default function SpaceTravelerGraphic() {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className={`space-traveler-graphic-wrap ${isLoaded ? 'is-loaded' : 'is-loading'}`}>
      {!isLoaded && <div className="space-traveler-shimmer" />}
      <div className={`space-traveler-container ${isLoaded ? 'visible' : 'hidden'}`}>
        <img
          src="/images/login-hero-bg.jpg"
          alt="Space Traveler Welcome"
          className="space-traveler-graphic"
          onLoad={() => setIsLoaded(true)}
          fetchPriority="high"
        />
        <div className="space-traveler-overlay" />
      </div>
    </div>
  );
}
